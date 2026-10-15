"""Builds the song files in src/assets/songs/ for Semi-Conductor.

    pip install mido
    python tools/songs/make_songs.py

Each song is a Tone.js-style JSON file (header + tracks of notes) whose
track instruments match the names in src/assets/samples.json:
violin, string ensemble 1, viola, cello, contrabass.

- Winter: converted from winter-mov1.midi, which was made with LilyPond
  from the Mutopia Project edition of Vivaldi's Winter (CC BY-SA 3.0).
- Can-Can and The Star-Spangled Banner: simple string arrangements of the
  public-domain melodies, written out below.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'assets', 'songs')
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
FLATS = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'}
INSTRUMENTS = ['violin', 'string ensemble 1', 'viola', 'cello', 'contrabass']


def midi(name):
    m = re.match(r'([A-G][b#]?)(-?\d)$', name)
    pc = FLATS.get(m[1], m[1])
    return NAMES.index(pc) + 12 * (int(m[2]) + 1)


def note_name(n):
    return f'{NAMES[n % 12]}{n // 12 - 1}'


def write_song(filename, title, bpm, beats_per_bar, tracks, total_beats):
    """tracks: {instrument: [(start_beat, duration_beats, midi_note), ...]}"""
    spb = 60 / bpm
    duration = round(total_beats * spb, 4)
    song = {
        'header': {'PPQ': 480, 'bpm': bpm,
                   'timeSignature': [beats_per_bar, 4], 'name': title},
        'startTime': 0,
        'duration': duration,
        'tracks': [],
    }
    for i, inst in enumerate(INSTRUMENTS):
        notes = [{'name': note_name(n), 'midi': n,
                  'time': round(s * spb, 6), 'velocity': 0.8,
                  'duration': round(d * spb, 6)}
                 for s, d, n in sorted(tracks[inst])]
        song['tracks'].append({
            'startTime': 0, 'duration': duration, 'length': len(notes),
            'id': i, 'name': title if i == 0 else None,
            'instrumentNumber': 0, 'instrument': inst,
            'instrumentFamily': 'strings', 'channelNumber': i,
            'isPercussion': False, 'notes': notes})
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, filename), 'w') as f:
        json.dump(song, f)
    print(f'{filename}: {duration:.1f}s at {bpm} bpm, '
          + ', '.join(f'{t["instrument"]} {t["length"]}' for t in song['tracks']))


# ---------------------------------------------------------------------------
# Winter (Vivaldi), 1st movement, bars 1-26

def make_winter():
    import mido
    m = mido.MidiFile(os.path.join(HERE, 'winter-mov1.midi'))
    tpb = m.ticks_per_beat
    end = (25 * 4 + 2) * tpb    # bar 26, beat 3: the F minor cadence
    final_beats = 2

    def notes(track):
        tick, on, out = 0, {}, []
        for msg in track:
            tick += msg.time
            if msg.type == 'note_on' and msg.velocity > 0:
                on[msg.note] = tick
            elif msg.type in ('note_off', 'note_on') and msg.note in on:
                start = on.pop(msg.note)
                out.append((start, tick - start, msg.note))
        return out

    def clip(evts):
        out = []
        for s, d, n in sorted(evts):
            if s > end:
                continue
            d = final_beats * tpb if s == end else min(d, end - s)
            out.append((s / tpb, d / tpb, n))
        return out

    def thin_runs(evts):
        # The solo violin's 32nd-note runs are too fast to hear clearly with
        # these samples, so keep only the notes on 16th-note positions
        out = []
        for s, d, n in evts:
            if d < 0.25 and abs(s * 4 - round(s * 4)) > 1e-6:
                continue
            out.append((s, max(d, 0.25) if d < 0.25 else d, n))
        return out

    solo, v1, v2, viola, cello = [notes(t) for t in m.tracks[1:6]]
    cello = clip(cello)
    tracks = {
        'violin': thin_runs(clip(solo)),
        'string ensemble 1': clip(v1 + v2),
        'viola': clip(viola),
        'cello': cello,
        # Double bass plays the cello line an octave lower (when in range)
        'contrabass': [(s, d, n - 12 if n - 12 >= 28 else n) for s, d, n in cello],
    }
    write_song('winter.json', "Winter (L'inverno) – Vivaldi", 92, 4, tracks,
               end / tpb + final_beats)


# ---------------------------------------------------------------------------
# Helpers for the hand-written arrangements

CHORDS = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10]}


def chord_tones(chord):
    m = re.match(r'([A-G][b#]?)(m|7)?$', chord)
    root = NAMES.index(FLATS.get(m[1], m[1]))
    return root, [(root + i) % 12 for i in CHORDS[m[2] or '']]


def nearest(pcs, target, lo, hi):
    options = [n for n in range(lo, hi + 1) if n % 12 in pcs]
    return min(options, key=lambda n: abs(n - target))


def melody_track(bars, beats_per_bar):
    out, beat = [], 0
    for bar in bars:
        for name, length in bar:
            if name != 'r':
                out.append((beat, length, midi(name)))
            beat += length
    return out


def chord_spans(chords, beats_per_bar):
    """chords: one entry per bar, either 'C' or [(beat, 'C'), (beat, 'G7')]."""
    spans = []
    for b, bar in enumerate(chords):
        bar = [(0, bar)] if isinstance(bar, str) else bar
        for i, (beat, chord) in enumerate(bar):
            stop = bar[i + 1][0] if i + 1 < len(bar) else beats_per_bar
            spans.append((b * beats_per_bar + beat, stop - beat, chord))
    return spans


# ---------------------------------------------------------------------------
# Can-Can (Offenbach, "Galop infernal" from Orpheus in the Underworld)

def make_can_can():
    q, e = 1, 0.5
    phrase = [
        [('C5', 2 * q)],
        [('D5', e), ('F5', e), ('E5', e), ('D5', e)],
        [('G5', q), ('G5', q)],
        [('G5', e), ('A5', e), ('E5', e), ('F5', e)],
        [('D5', q), ('D5', q)],
        [('D5', e), ('F5', e), ('E5', e), ('D5', e)],
        [('C5', e), ('C6', e), ('B5', e), ('A5', e)],
        [('G5', e), ('F5', e), ('E5', e), ('D5', e)],
    ]
    phrase_chords = ['C', 'G7', 'C', 'C', 'G7', 'G7', 'C', 'G7']
    repeats = 4
    bars = phrase * repeats + [[('C5', q), ('r', q)]]
    chords = phrase_chords * repeats + ['C']
    tracks = {i: [] for i in INSTRUMENTS}
    tracks['violin'] = melody_track(bars, 2)
    for start, length, chord in chord_spans(chords, 2):
        root, pcs = chord_tones(chord)
        last = start == (len(bars) - 1) * 2
        for beat in range(int(length)):
            t = start + beat
            # "Oom": bass notes on the beat
            bass = nearest([root], 48, 43, 54)
            cello_note = bass if beat % 2 == 0 else nearest([(root + 7) % 12], bass, 43, 55)
            tracks['cello'].append((t, 0.45, cello_note))
            tracks['contrabass'].append((t, 0.45, bass - 12))
            if last:
                break
            # "Pah": chords on the off-beats
            tracks['viola'].append((t + 0.5, 0.4, nearest(pcs, 60, 55, 64)))
            tracks['string ensemble 1'].append((t + 0.5, 0.4, nearest(pcs, 67, 64, 72)))
            tracks['string ensemble 1'].append((t + 0.5, 0.4, nearest(pcs, 72, 69, 76)))
        if last:
            tracks['viola'].append((start, 1, midi('G4')))
            tracks['string ensemble 1'].append((start, 1, midi('E5')))
    write_song('can-can.json', 'Can-Can – Offenbach', 112, 2, tracks, len(bars) * 2)


# ---------------------------------------------------------------------------
# The Star-Spangled Banner (John Stafford Smith), in B-flat

def make_anthem():
    phrase_a = [
        [('Bb3', 1), ('D4', 1), ('F4', 1)],
        [('Bb4', 2), ('D5', .75), ('C5', .25)],
        [('Bb4', 1), ('D4', 1), ('E4', 1)],
        [('F4', 2), ('F4', .5), ('F4', .5)],
        [('D5', 1.5), ('C5', .5), ('Bb4', 1)],
        [('A4', 2), ('G4', .75), ('A4', .25)],
        [('Bb4', 1), ('Bb4', 1), ('F4', 1)],
    ]
    chords_a = ['Bb', 'Bb', [(0, 'Bb'), (2, 'C7')], 'F', 'Bb',
                [(0, 'F'), (2, 'C7')], [(0, 'Bb'), (2, 'F')]]
    bars = (
        [[('r', 2), ('F4', .75), ('D4', .25)]]                    # O say can you see
        + phrase_a + [[('D4', 1), ('Bb3', 1), ('F4', .75), ('D4', .25)]]
        + phrase_a + [[('D4', 1), ('Bb3', 1), ('D5', .5), ('D5', .5)]]
        + [
            [('D5', 1), ('Eb5', 1), ('F5', 1)],                   # rockets' red glare
            [('F5', 2), ('Eb5', .5), ('D5', .5)],
            [('C5', 1), ('D5', 1), ('Eb5', 1)],
            [('Eb5', 2), ('Eb5', 1)],
            [('D5', 1.5), ('C5', .5), ('Bb4', 1)],
            [('A4', 2), ('G4', .75), ('A4', .25)],
            [('Bb4', 1), ('D4', 1), ('E4', 1)],
            [('F4', 2), ('F4', 1)],
            [('Bb4', 1), ('Bb4', 1), ('Bb4', .5), ('A4', .5)],    # O say does that
            [('G4', 1), ('G4', 1), ('G4', 1)],
            [('C5', 1), ('Eb5', .5), ('D5', .5), ('C5', .5), ('Bb4', .5)],
            [('Bb4', 1), ('A4', 1), ('F4', .5), ('F4', .5)],
            [('Bb4', 1.5), ('C5', .5), ('D5', .5), ('Eb5', .5)],  # land of the free
            [('F5', 2), ('Bb4', .5), ('C5', .5)],
            [('D5', 1.5), ('Eb5', .5), ('C5', 1)],                # home of the brave
            [('Bb4', 3)],
        ]
    )
    chords = (
        ['Bb'] + chords_a + ['Bb'] + chords_a + ['Bb']
        + ['Bb', 'Bb', 'F7', 'F7', 'Bb', [(0, 'F'), (2, 'C7')],
           [(0, 'Bb'), (2, 'C7')], 'F',
           'Bb', 'Eb', [(0, 'Cm'), (2, 'F7')], [(0, 'Bb'), (1, 'F')],
           [(0, 'Bb'), (2, 'Eb')], 'Bb', [(0, 'Bb'), (2, 'F7')], 'Bb']
    )
    assert len(bars) == len(chords)
    tracks = {i: [] for i in INSTRUMENTS}
    tracks['violin'] = melody_track(bars, 3)
    for start, length, chord in chord_spans(chords, 3):
        root, pcs = chord_tones(chord)
        bass = nearest([root], 46, 41, 52)
        tracks['cello'].append((start, length, bass))
        tracks['contrabass'].append((start, length, bass - 12))
        # Inner strings repeat the chord on every beat, so the orchestra
        # follows the conductor's beat even during long melody notes
        for beat in range(int(length)):
            t = start + beat
            tracks['viola'].append((t, 0.9, nearest(pcs, 57, 53, 62)))
            tracks['string ensemble 1'].append((t, 0.9, nearest(pcs, 65, 62, 70)))
    write_song('star-spangled-banner.json', 'The Star-Spangled Banner',
               84, 3, tracks, len(bars) * 3)


if __name__ == '__main__':
    make_winter()
    make_can_can()
    make_anthem()
