/*
Copyright 2019 Google LLC

Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

import config from '../config';
import * as posenet from '@tensorflow-models/posenet';
import PosenetRenderer from './posenet-renderer';
import BeatDetector from './beat-detector';
import { smooth } from './smoothing';
import { getKeypoint, getKeypoints, getMidpoint, getDistance } from './helpers';

// FYI -- 'leftWrist' is actually your right wrist ¯\_(ツ)_/¯ 

export default class PoseController {
  constructor(props) {
    this.props = props;
    this.armspan = 400;

    // One beat detector per hand; whichever hand is conducting sets the tempo
    const beatOptions = {
      minBpm: config.detection.minimumBpm,
      maxBpm: config.detection.maximumBpm,
      maxBeatGap: config.detection.maximumBeatGap,
      beatsToCompare: config.detection.beatsToCompare,
      smoothing: config.smoothing.beatSmoothing
    };
    this.beatDetectors = {
      leftWrist: new BeatDetector(beatOptions),
      rightWrist: new BeatDetector(beatOptions)
    };
    this.initialized = false;
    this.playedFirstNote = false;
    this.isEstimatingPose = false;
    this.stoppingTimeout = { timeout: null, pose: null };
  }

  /* Create the video/canvas objects and start the neural net */
  async initialize() {
    this.video = await this.props.renderer.loadVideo();
    if (!this.video) return;

    this.video.play();

    const canvas = this.props.renderer.setupVideoCanvas();
    this.posenetRenderer = new PosenetRenderer({
      state: this.props.state,
      canvas: canvas
    });

    // Load the PoseNet weights bundled with the app (in /static/weights)
    // rather than from Google Cloud Storage, so it keeps working offline
    const variables = await new posenet.CheckpointLoader(config.paths.weightsPath).getAllVariables();
    this.net = new posenet.PoseNet(new posenet.MobileNet(variables, posenet.mobileNetArchitectures[75]));
    this.initialized = true;

    this.loop();
  }

  /* Main pose detection loop */
  async loop() {
    if (this.isEstimatingPose) { requestAnimationFrame(this.loop.bind(this)); return };

    this.isEstimatingPose = true;
    this.pose = await this.getPose();
    this.isEstimatingPose = false;

    if (!this.pose) {
      this.props.setTempo(0);
    }

    if (!this.props.state.conducting) this.resetBeatDetectors();

    if (this.pose && this.props.state.calibrating) {
      if (this.detectCalibrationPose()) this.handleCalibration();
    }

    if (this.pose && this.props.state.conducting) {
      const tempo = this.detectTempo();
      if (tempo) {
        this.hasTempo = true;
        this.props.setTempo(tempo);
      }

      this.props.setInstrumentGroup(this.getHandZone());
      this.props.setVelocity(this.getNormalisedHeight());
      this.setStoppingTimeout(); // Stop if hands not moving
    }

    this.posenetRenderer.drawFrame(this.video, this.pose);
    requestAnimationFrame(this.loop.bind(this));
  }

  /* Get pose from Posenet and apply smoothing */
  async getPose() {
    const posenetArgs = [
      this.video,
      config.posenet.imageScaleFactor,
      config.posenet.flipHorizontal,
      config.posenet.outputStride
    ];

    // Detect the pose
    let pose;
    if (config.posenet.algorithm === 'single-pose') {
      pose = await this.net.estimateSinglePose(...posenetArgs)
    } else {
      const poses = await this.net.estimateMultiplePoses(...posenetArgs);
      if (poses.length === 0) {
        return;
      }
      // Take the pose with the highest score
      // pose = poses.reduce((prev, current) => (prev.score >= current.score) ? prev : current);
      pose = poses[0];
    }

    if (pose.score >= config.posenet.minPoseConfidence) {
      this.poseVisible = true;
      // Keep the unsmoothed wrists for beat detection, as the heavy
      // smoothing below flattens out quick conducting strokes
      this.rawWrists = {};
      ['leftWrist', 'rightWrist'].forEach((part) => {
        const keypoint = getKeypoint(pose, part);
        this.rawWrists[part] = { y: keypoint.position.y, score: keypoint.score };
      });
      return smooth(pose, this.armspan);
    } else {
      this.poseVisible = false;
      this.props.stop();
      return;
    }
  }

  /* Calibration detection methods */

  detectCalibrationPose() {
    const parts = getKeypoints(this.pose, [
      'leftWrist', 'rightWrist', 'leftElbow',
      'rightElbow', 'leftShoulder', 'rightShoulder'
    ]);
    const margin = config.detection.calibrationMargin;
    const maxDist = config.display.width;
    
    // Look for a T-shape pose, with hands in line with elbows and shoulders
    return (
      // this.handsVisible() &&
      (parts.leftWrist.position.y < parts.leftShoulder.position.y + margin) &&
      (parts.leftWrist.position.y > parts.leftShoulder.position.y - margin) &&
      (parts.rightWrist.position.y < parts.rightShoulder.position.y + margin) &&
      (parts.rightWrist.position.y > parts.rightShoulder.position.y - margin) &&
      (parts.leftWrist.position.y < parts.leftElbow.position.y + margin) &&
      (parts.leftWrist.position.y > parts.leftElbow.position.y - margin) &&
      (parts.rightWrist.position.y < parts.rightElbow.position.y + margin) &&
      (parts.rightWrist.position.y > parts.rightElbow.position.y - margin) && 
      (parts.leftWrist.position.x > 0) && (parts.leftWrist.position.x < maxDist) &&
      (parts.rightWrist.position.x > 0) && (parts.rightWrist.position.x < maxDist)
    );
  }

  handleCalibration() {
    this.armspan = this.getHandDistance();
    this.props.handleCalibration();
  }

  /* Tempo detection: feed both hands' heights to their beat detectors,
     and use the tempo from whichever hand is moving up & down the most */
  detectTempo() {
    const now = performance.now();
    const threshold = Math.max(
      config.detection.beatMovementArmspanRatio * this.armspan,
      config.detection.minimumBeatMovement
    );
    const tempos = {};
    Object.keys(this.beatDetectors).forEach((part) => {
      const hand = this.rawWrists[part];
      // Skip frames where PoseNet isn't sure where the hand is
      if (hand.score < config.detection.minimumBeatConfidence) return;
      tempos[part] = this.beatDetectors[part].update(hand.y, now, threshold);
    });

    const conductingHand = Object.keys(this.beatDetectors).reduce((a, b) =>
      this.beatDetectors[a].recentRange() >= this.beatDetectors[b].recentRange() ? a : b);
    return tempos[conductingHand];
  }

  resetBeatDetectors() {
    Object.keys(this.beatDetectors).forEach(part => this.beatDetectors[part].reset());
    this.hasTempo = false;
    this.movingSince = null;
    this.playedFirstNote = false;
  }

  /* Like a real orchestra, wait for the conductor's first couple of beats
     so the music starts at their tempo. If the hands are moving but no
     beats are found (e.g. waving side to side), start anyway after a bit */
  readyToStart() {
    if (this.hasTempo || this.playedFirstNote) return true;
    const now = performance.now();
    if (this.movingSince === null) this.movingSince = now;
    return now - this.movingSince > config.detection.startWithoutBeatsAfter;
  }

  /* Stop music if hands not moving */
  setStoppingTimeout() {
    if (this.stoppingTimeout.timeout) return; // Already in progress
    const factor = config.detection.beatLengthStoppingIntervalRatio;
    const max = config.detection.stoppingDistanceArmspanRatio * this.armspan;
    const interval = this.props.getBeatLength() * factor;

    this.stoppingTimeout.timeout = setTimeout(() => {
      this.stoppingTimeout.timeout = null;
      // Get previous pose and this pose, return if no previous pose
      const lastPose = this.stoppingTimeout.pose;
      const thisPose = this.stoppingTimeout.pose = this.pose;
      if (!lastPose || !thisPose) return;

      // Calculate positions & difference between before & after interval
      const lastLeftWrist = getKeypoint(lastPose, 'leftWrist')
      const thisLeftWrist = getKeypoint(thisPose, 'leftWrist');
      const lastRightWrist = getKeypoint(lastPose, 'rightWrist');
      const thisRightWrist = getKeypoint(thisPose, 'rightWrist');
      const diff1 = getDistance(lastLeftWrist.position, thisLeftWrist.position);
      const diff2 = getDistance(lastRightWrist.position, thisRightWrist.position);

      // If difference is big enough, stop music
      if (diff1 < max && diff2 < max) {
        this.props.stop();
      } else {
        if (this.props.state.conducting && this.poseVisible && this.readyToStart()) {
          this.playedFirstNote = true;
          this.props.start();
        }
      }
    }, interval);
  }

  /* Check if hands are reliably in scene */
  handsVisible() {
    const leftWrist = getKeypoint(this.pose, 'leftWrist');
    const rightWrist = getKeypoint(this.pose, 'rightWrist');
    
    return (
      leftWrist.score > config.posenet.minPartConfidence
      && rightWrist.score > config.posenet.minPartConfidence
    );
  }

  /* Gets distance between leftWrist and rightWrist keypoints at any one time */
  getHandDistance() {
    const leftWrist = getKeypoint(this.pose, 'leftWrist');
    const rightWrist = getKeypoint(this.pose, 'rightWrist');
    return getDistance(leftWrist.position, rightWrist.position);
  }

  /* Check whether hands are to the left, right or center */
  getHandZone() {
    const leftWrist = getKeypoint(this.pose, 'leftWrist');
    const rightWrist = getKeypoint(this.pose, 'rightWrist');
    const midpoint = getMidpoint(leftWrist, rightWrist);
    const zones = config.zones;

    for (let i = 0; i < zones.length; i++) {
      if (zones[i].start < midpoint && midpoint < zones[i].end) return i;
    }
  }

  getNormalisedHeight() {
    const leftWrist = getKeypoint(this.pose, 'leftWrist');
    const rightWrist = getKeypoint(this.pose, 'rightWrist');
    const highestY = Math.min(leftWrist.position.y, rightWrist.position.y);
    const normalisedHeight = (1 - highestY / config.display.height);
    return normalisedHeight;
  }
}