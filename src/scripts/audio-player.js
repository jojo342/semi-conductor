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

import Tone from 'tone';
import config from '../config.js';
import { getBeatLengthFromTempo, constrain } from './helpers';

export default class AudioPlayer {
  constructor(props) {
    this.props = props;
    this.instrumentsLoaded = 0;
    this.instruments = Object.keys(props.samples);
    this.activeInstruments = this.instruments.slice();
    this.samplers = {};
    this.parts = [];
    this.velocity = 0.7;  // Arbitrary starting point that will be overridden by user
    this.finishedInstruments = 0;
    this.loadInstruments();
  }

  /* Called from main.js when tempo received from PoseController */
  setTempo(tempo) {
    Tone.Transport.bpm.value = constrain(tempo, {
      min: 0,
      max: config.detection.maximumBpm
    });
  }

  /* Set up effects, then call function to generate samplers */
  async loadInstruments() {
    // Make it sounds nice
    const gain = new Tone.Gain(config.tone.gain);
    const jcReverb = new Tone.JCReverb();
    const reverb = new Tone.Reverb(config.tone.reverb);
    jcReverb.wet.value = config.tone.jcReverbWet;
    reverb.wet.value = config.tone.reverbWet;
    await reverb.generate();

    this.generateSamplers({ gain, jcReverb, reverb });
  }

  /* Generates a sampler for each instrument in samples.json. Every song
     uses these same instruments, so they're shared between songs. */
  generateSamplers(effects) {
    // Instruments should be given their official MIDI name, but lowercase,
    // e.g. 'cello'. This will be under tracks[i].instrument in the song json.
    this.instruments.forEach((instrument) => {
      this.samplers[instrument] = new Tone.Sampler(
        this.props.samples[instrument], // Sample URLs in samples.json
        this.instrumentLoadCallback.bind(this), // Tells main.js the loading progress
        config.paths.samplesPath // Root path for samples
      ).chain(effects.gain, effects.jcReverb, effects.reverb, Tone.Master);
    });
  }

  /* Swap in a new song, removing the notes of the previous one */
  loadSong(song) {
    Tone.Transport.stop();
    this.parts.forEach(part => part.dispose());
    this.parts = [];
    this.song = song;
    const beatsPerMeasure = song.header.timeSignature[0];
    this.totalMeasures = (song.duration / 60) * (song.header.bpm / beatsPerMeasure);
    this.queueSong();
  }

  /* Go through each track and trigger load function */
  queueSong() {
    const song = this.song;
    const startTime = song.startTime;

    // Queue each of the tracks
    Tone.Transport.bpm.value = this.startingBpm = song.header.bpm;
    Tone.Transport.timeSignature = song.header.timeSignature;
    song.tracks.forEach((track) => {
      this.queueTrack(track, this.samplers[track.instrument]);
    });

    Tone.Transport.position = startTime;
  }

  /* Add all notes to the Transport, with the relevant instrument */
  queueTrack(track, instrument) {
    const part = new Tone.Part((time, note) => {
      const measures = parseInt(Tone.Transport.position.split(':')[0]) + 1;
      this.props.setSongProgress(100 * measures / this.totalMeasures)

      // Only play the instrument this bar if it's active
      if (this.activeInstruments.includes(track.instrument)) {
        // Adjust note duration based on tempo (slower tempo = longer notes)
        const durationRatio = this.startingBpm / Math.max(Tone.Transport.bpm.value, config.detection.minimumBpm);
        const duration = constrain(note.duration * durationRatio, {
          max: config.detection.maximumDuration,
          min: config.detection.minimumDuration
        });

        const velocity = constrain(this.velocity, {
          max: config.detection.maximumVelocity,
          min: config.detection.minimumVelocity
        });

        // Add a small time variation around 0 to make it sound more human
        // const variation = (Math.random() - 0.5) * 0.03;
        // Cue a note to be triggered at the time, with the pitch and duration
        instrument.triggerAttackRelease(note.name, duration, time, velocity); 
        this.props.triggerAnimation(track.instrument, duration, this.velocity);
      }
    }, track.notes).start();
    this.parts.push(part);
  }

  /* Updates the loading screen with current progress */
  instrumentLoadCallback() {
    this.instrumentsLoaded++;
    const percentage = 100 * this.instrumentsLoaded / this.instruments.length;
    this.props.setInstrumentsLoaded(percentage);
  }

  /* Change which instruments are playing based on PoseController data */
  setInstrumentGroup(i) {
    this.activeInstruments = config.zones[i].instruments
  }

  /* Change velocity based on PoseController data */
  setVelocity(vel) {
    this.velocity = vel;
  }

  getBeatLength() {
    return getBeatLengthFromTempo(Tone.Transport.bpm.value);
  }

  start() {
    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.pause();
  }

  restart() {
    Tone.Transport.stop();
    this.beatsElapsed = 0;
    Tone.Transport.bpm.value = this.startingBpm;
  }
}