# Semi-Conductor: Winter classroom edition ❄️🎻

This is a fork of Google Creative Lab's open-source
[Semi-Conductor](https://github.com/googlecreativelab/semi-conductor), rebuilt
for a 6th-grade computer science class after the original website was taken
down. It is not an official Google product.

What's different from the original:

- **Song:** the first movement of Vivaldi's *Winter* (L'inverno, RV 297,
  Op. 8 No. 4), *Allegro non molto*, bars 1-26 (about a minute at the
  starting tempo). It is converted from the
  [Mutopia Project](https://www.mutopiaproject.org/) edition, licensed
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
  Track mapping: solo violin → `violin`, 1st & 2nd violins →
  `string ensemble 1`, viola → `viola`, cello/continuo → `cello` and
  `contrabass` (an octave lower).
- **Instrument sounds:** Google never published the original recordings, so
  this uses free samples from
  [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)
  (CC BY 3.0). See `static/samples/CREDITS.md`.
- **Body tracking model:** the PoseNet weights are stored in
  `static/weights/` instead of being downloaded from Google Cloud Storage.
- **Privacy:** Google Analytics and the social-sharing tags were removed.
  The webcam video stays on the computer; nothing is uploaded.
- **Ready to host:** a built copy of the site is in `docs/`, so it can be
  published with GitHub Pages (Settings → Pages → branch `master`, folder
  `/docs`). `docs/winter-preview.mp3` is a rough audio preview of the
  arrangement.

To rebuild after changing something: `yarn`, then
`npx parcel build src/index.html --out-dir docs --public-url ./ --no-source-maps`.

---

<table>
  <tr>
    <td>
      This project is no longer actively maintained by the Google Creative Lab but remains here in a read-only Archive mode so that it can continue to assist developers that may find the examples helpful. We aren’t able to address all pull requests or bug reports but outstanding issues will remain in read-only mode for reference purposes. Also, please note that some of the dependencies may not be up to date and there hasn’t been any QA done in a while so your mileage may vary.
      <br><br>
      For more details on how Archiving affects Github repositories see <a href="https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/about-archiving-repositories">this documentation </a>.
      <br><br>
      <b>We welcome users to fork this repository</b> should there be more useful, community-driven efforts that can help continue what this project began.
    </td>
  </tr>
</table>

# Semi-Conductor 🎻

![An animation of Semi-Conductor in action.](semi-conductor.gif)

[Semi-Conductor](https://semiconductor.withgoogle.com) allows you to conduct a virtual orchestra using only your web browser & webcam. Try it out [live here](https://semiconductor.withgoogle.com)!

It uses [Posenet](https://github.com/tensorflow/tfjs-models/tree/master/posenet) to detect your body pose, and from that how fast you are moving your hands. Using this data and the [Tone.js](https://github.com/Tonejs/Tone.js/) web audio library, it plays real samples of orchestral instruments playing individual notes at the speed of your conducting, which play live from a score you that can edit.

It's been build to be remixed, so read on to learn how to build and edit your own version of Semi-Conductor, with custom music and instruments.

## Quick Start

```sh
yarn  # Install dependencies
```
```sh
yarn start  # Start a local dev server
```
```sh
yarn build  # Build static site into the /dist folder
```

## Code Structure

Semi-Conductor is built in vanilla JS without a framework. Each JS file in the `/scripts` folder contains a class module, with each class controlling one portion of the app (also there are some helper files with useful functions). It's designed so that modules can be used or deleted according to how you want to remix the app.

- `main.js` controls the primary app state & functions, including loading the app and instantiating the other classes
- `renderer.js` handles all the UI/DOM updating
- `orchestra.js` controls the graphic of the orchestra, made with PIXI.js
- `pose-controller.js` uses TFJS to get the pose state from the webcam with Posenet
- `posenet-renderer.js` renders the pose skeleton in the interface
- `audio-player.js` handles the MIDI playback & loading of samples using Tone.js

## How to remix this

#### Adding instrument samples

We haven't included the original audio samples used in the live [Semi-Conductor experiment](https://semiconductor.withgoogle.com), but you can use an open sound library like [Sonatina Symphonic Orchestra](https://github.com/peastman/sso) (just make sure you have the rights to use samples you choose in accordance to their licence agreement), or even record your own.

Add your samples to `/static/samples`, and then add to `/src/assets/samples.json` the relative paths from the `/static/samples` directory to each sample. Samples are organised first by instrument name, then by note. Note descriptions are of the format `C4` for middle C, or `D#5` for the D sharp the octave above middle C. You don't need to have all the notes for a given instrument, Tone.js will interpolate between the samples you have provided.

#### Changing instrumentation

Semi-Conductor is designed to work with a string quartet, however you can change the instrumentation as you desire. Create a rock band, percussion ensemble or synth orchestra if you want! If you're low on disk space, you could even replicate John Cage's [4'33"](https://youtu.be/Oh-o3udImy8?t=57).

Follow the steps above with whichever instruments & samples you want to add. Then, edit `config.js` to include the instrument names you want to have play for each zone (instruments change as you move your hands from the left to the right of the screen while conducting). 

You will also need to have a `song.json` file (see below) that only contains instrument names that correspond the ones in `samples.json`. You may need to remove or edit the `orchestra.js` module, as it will break if it doesn't recognise the instrument names.

#### Changing the MIDI song

The current MIDI song is a custom arrangement of Mozart's *Eine Kleine Nachtmusik* made by us. But you can swap this out with any MIDI file, you just need to convert it to JSON and make sure you have samples listed in `samples.json` with the same instrument names as the tracks.

To build a `song.json` file, create or acquire a MIDI file you want to use. Then, head to [this Tone.js website](http://tonejs.github.io/Midi/) to convert the MIDI into a JSON file that Tone.js can read. Go through the JSON file and edit the instrument names to correspond to the instrument names in `samples.json` and then move this file to `/src/assets/song.json`.

## Contributors

Built by [Rupert Parry](https://www.rparry.me/), [Melissa Lu](https://melissaludesigns.com/), Samantha Cordingley, [Haylie Craig](https://www.hayliecraig.com/), and the team at Google Creative Lab, Sydney.

## License & Notes

Semi-Conductor has been made available under the [Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0) (see LICENSE file in this repository for details).

We encourage open sourcing projects as a way of learning from each other. Please respect our and other creators’ rights, including copyright and trademark rights when present when sharing these works and creating derivative work. If you want more info on Google's policy, you can find it [here](https://www.google.com/permissions/). To contribute to the project, please refer to the CONTRIBUTING file in this repository.

This is an experiment, not an official Google product. We do our best to support and maintain this experiment, but your mileage may vary. 
