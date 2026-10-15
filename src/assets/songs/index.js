/* The songs shown on the song selection page. To add one, build a song
   json file (see tools/songs/make_songs.py) and add an entry here. */

import winter from './winter.json';
import canCan from './can-can.json';
import anthem from './star-spangled-banner.json';

export default [
  {
    name: 'Winter',
    composer: 'Antonio Vivaldi · 1720s',
    blurb: 'Shivering strings and an icy wind from <i>The Four Seasons</i>.',
    emoji: '❄️',
    data: winter
  },
  {
    name: 'Can-Can',
    composer: 'Jacques Offenbach · 1858',
    blurb: 'A wild, high-kicking dance. How fast can your orchestra go?',
    emoji: '💃',
    data: canCan
  },
  {
    name: 'The Star-Spangled Banner',
    composer: 'John Stafford Smith · U.S. national anthem',
    blurb: 'Big, proud and steady. Lead it like a real ceremony.',
    emoji: '🎆',
    data: anthem
  }
];
