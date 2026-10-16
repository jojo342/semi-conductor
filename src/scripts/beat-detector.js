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

/* Finds conducting beats in the up & down movement of one hand.

   A beat is the bottom of a down-stroke: the moment the hand stops going
   down and starts coming back up. The tempo is then the time between beats,
   like a real orchestra following a conductor's baton.

   To ignore the small wobbles in PoseNet's keypoints, the hand has to travel
   at least `threshold` pixels back up before a turn counts. */
export default class BeatDetector {
  constructor(options) {
    // { minBpm, maxBpm, maxBeatGap (ms), beatsToCompare, smoothing }
    this.options = options;
    this.reset();
  }

  reset() {
    this.smoothedY = null;
    // Start by looking for the top of a stroke, so the first beat counted
    // is a real bottom rather than wherever the hand happened to start
    this.goingDown = false;
    this.extreme = null;      // Lowest (or highest) point of the current stroke
    this.lastBeatTime = null;
    this.intervals = [];
    this.history = [];        // Recent heights, to measure how much hand moves
  }

  /* y: height of the hand in pixels (bigger = lower on screen)
     time: in milliseconds
     threshold: how far (pixels) the hand must turn back to count
     Returns the new tempo in bpm when a beat completes, otherwise null */
  update(rawY, time, threshold) {
    // Light smoothing to take the edge off PoseNet's wobble
    const smoothing = this.options.smoothing;
    const y = this.smoothedY = this.smoothedY === null
      ? rawY
      : (this.smoothedY - rawY) * smoothing + rawY;

    this.history.push({ y, time });
    while (this.history.length && time - this.history[0].time > 1500) {
      this.history.shift();
    }

    if (!this.extreme) {
      this.extreme = { y, time };
      return null;
    }

    if (this.goingDown) {
      if (y > this.extreme.y) {
        this.extreme = { y, time };
      } else if (this.extreme.y - y > threshold) {
        // The hand turned around at the bottom: that was a beat
        const beatTime = this.extreme.time;
        this.goingDown = false;
        this.extreme = { y, time };
        return this.addBeat(beatTime);
      }
    } else {
      if (y < this.extreme.y) {
        this.extreme = { y, time };
      } else if (y - this.extreme.y > threshold) {
        // Turned around at the top, now heading down to the next beat
        this.goingDown = true;
        this.extreme = { y, time };
      }
    }
    return null;
  }

  addBeat(time) {
    const lastBeatTime = this.lastBeatTime;
    this.lastBeatTime = time;
    if (lastBeatTime === null) return null;

    const interval = time - lastBeatTime;
    if (interval > this.options.maxBeatGap) {
      // Conductor paused, so start measuring the tempo afresh
      this.intervals = [];
      return null;
    }

    this.intervals.push(interval);
    if (this.intervals.length > this.options.beatsToCompare) this.intervals.shift();

    // Use the median time between the last few beats, so one extra 'beat'
    // from a tracking glitch doesn't throw the tempo off
    const sorted = this.intervals.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const bpm = 60000 / median;
    return Math.max(this.options.minBpm, Math.min(this.options.maxBpm, bpm));
  }

  /* How far the hand has moved up & down in the last 1.5 seconds */
  recentRange() {
    if (!this.history.length) return 0;
    const ys = this.history.map(point => point.y);
    return Math.max(...ys) - Math.min(...ys);
  }
}
