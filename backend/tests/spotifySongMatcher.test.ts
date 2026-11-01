import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Song } from '../src/models/music.model.js';
import type { SpotifyTrackMetadata } from '../src/providers/spotifyPlaylistProvider.js';
import { findSpotifySongMatch, spotifySearchTitle, spotifySearchQueries } from '../src/utils/spotifySongMatcher.js';
import { MusicService } from '../src/services/musicService.js';
import { JioSaavnProvider } from '../src/providers/jiosaavnProvider.js';
import { globalCacheService } from '../src/services/cacheService.js';

const source = (title: string, artists: string[], duration: number, album = 'Album'): SpotifyTrackMetadata => ({
  id: 'spotify-track', title, artists, durationMs: duration * 1000, album,
});
const song = (id: string, name: string, artists: string[], duration: number, album = 'Album'): Song => ({
  id, name, artist_name: artists.join(', '), artists: artists.map((name, i) => ({ id: String(i), name })), artist_id: 'a',
  duration, album_name: album, album_id: 'album', album_image: '', image: '', audio: 'https://example.com/audio.mp3',
  audiodownload: '', license_ccurl: '', provider: 'jiosaavn', musicinfo: { tags: { genres: [], instruments: [], vartags: [] } },
});

test('film, title-track and feature annotations normalize without removing recording versions', () => {
  for (const [title, expected] of [
    ['Pardesiya - From "Param Sundari"', 'Pardesiya'],
    ['Pardesiya (From "Param Sundari" / Female Version)', 'Pardesiya (Female Version)'],
    ['Kabhi Jo Baadal Barse (From "Jackpot)', 'Kabhi Jo Baadal Barse'],
    ['Bolna (From "Kapoor & Sons (Since 1921)")', 'Bolna'],
    ['Pal Pal Dil Ke Paas - Title Track - From "Pal Pal Dil Ke Paas"', 'Pal Pal Dil Ke Paas'],
    ['Jhol - Acoustic (feat. Asfand)', 'Jhol - Acoustic'],
    ['Jhol (Acoustic Version)', 'Jhol (Acoustic)'],
    ['Song (Alternate Take)', 'Song (Alternate Take)'],
    ['Yeh Tune Kya Kia - Live', 'Yeh Tune Kya Kia - Live'],
  ]) assert.equal(spotifySearchTitle(title), expected, title);
});

test('all artist credits participate, including singers listed after a composer', () => {
  const target = source('Aaj Se Teri', ['Amit Trivedi', 'Arijit Singh'], 312.24, 'Padman (Original Motion Picture Soundtrack)');
  const correct = song('arijit', 'Aaj Se Teri', ['Arijit Singh'], 312, 'Romantic Classics Hits');
  const wrong = song('other', 'Aaj Se Teri', ['Rishi Singh'], 312, 'Non Stop Arijit Singh Hits');
  assert.equal(findSpotifySongMatch(target, [wrong, correct]), correct);
  assert.ok(spotifySearchQueries(target).includes('Aaj Se Teri Arijit Singh'));
});

test('duo punctuation and credit order do not create false ambiguity', () => {
  const target = source('Ishq Bulaava', ['Vishal-Shekhar', 'Sanam Puri', 'Shipra Goyal'], 303.64, 'Hasee Toh Phasee');
  const first = song('original', 'Ishq Bulaava', ['Vishal & Shekhar', 'Sanam Puri', 'Shipra Goyal'], 303, 'Hasee Toh Phasee');
  const compilation = song('compilation', 'Ishq Bulaava (From "Hasee Toh Phasee")', ['Shipra Goyal', 'Vishal & Shekhar', 'Sanam Puri'], 303, 'Hits');
  assert.equal(findSpotifySongMatch(target, [compilation, first]), first);
});

test('Pardesiya uses the original recording rather than a nearby female version', () => {
  const artists = ['Sachin-Jigar', 'Sonu Nigam', 'Krishnakali Saha', 'Amitabh Bhattacharya'];
  const target = source('Pardesiya - From "Param Sundari"', artists, 231.739, 'Pardesiya (From "Param Sundari")');
  const female = song('female', 'Pardesiya (From "Param Sundari" / Female Version)', ['Sachin-Jigar', 'Krishnakali Saha', 'Amitabh Bhattacharya'], 231);
  const original = song('original', 'Pardesiya (From "Param Sundari")', [...artists].reverse(), 232);
  assert.equal(findSpotifySongMatch(target, [female, original]), original);
  assert.equal(findSpotifySongMatch(target, [female]), null);
});

test('compilation copies may omit known credits or include a lyricist without rejecting the recording', () => {
  const target = source('Nashe Si Chadh Gayi', ['Vishal-Shekhar', 'Arijit Singh', 'Caralisa Monteiro', 'Jaideep Sahni'], 237.875, 'Befikre');
  const album = song('album', target.title, ['Arijit Singh', 'Caralisa Monteiro'], 237, 'Befikre');
  const compilation = song('compilation', target.title, ['Vishal & Shekhar', 'Arijit Singh', 'Jaideep Sahni'], 237, 'Dance Chartbusters');
  assert.equal(findSpotifySongMatch(target, [compilation, album]), album);
  const kun = source('Kun Faya Kun', ['A.R. Rahman', 'Javed Ali', 'Mohit Chauhan'], 470.5, 'Rockstar');
  const copies = [song('actor', kun.title, [...kun.artists, 'Ranbir Kapoor'], 469, 'Hits'),
    song('lyricist', `${kun.title} (From "Rockstar")`, [...kun.artists, 'Irshad Kamil'], 470, 'Soulful Sufis')];
  assert.ok(findSpotifySongMatch(kun, copies));
});

test('small transliteration differences and featured credits do not cause false ambiguity', () => {
  const samjhawan = source('Samjhawan', ['Jawad Ahmad', 'Shaarib Toshi', 'Arijit Singh', 'Shreya Ghoshal'], 269.184);
  assert.ok(findSpotifySongMatch(samjhawan, [song('a', 'Samjhawan', ['Jawad Ahmad', 'Sharib Toshi', 'Arijit Singh', 'Shreya Ghoshal'], 269),
    song('b', 'Samjhawan (From "Humpty Sharma Ki Dulhania")', samjhawan.artists, 269, 'Hits')]));
  const girl = source('Girl I Need You', ['Meet Bros.', 'Roach Killa', 'Khushboo Grewal', 'Arijit Singh'], 297.752, 'Baaghi');
  assert.ok(findSpotifySongMatch(girl, [song('a', girl.title, [...girl.artists, 'Kumaar'], 297, 'Hits'),
    song('b', `${girl.title} (feat. Arijit Singh)`, ['Meet Bros', 'Roach Killa', 'Khushboo Grewal', 'Kumaar'], 297, 'Baaghi')]));
});

test('matching compilation credits may be a subset of the album credits', () => {
  const target = source('Ik Vaari Aa (From "Raabta")', ['Pritam', 'Arijit Singh'], 274.687);
  const original = song('original', 'Ik Vaari Aa', ['Arijit Singh'], 275, 'Raabta');
  const compilation = song('compilation', target.title, ['Pritam', 'Arijit Singh', 'Amitabh Bhattacharya'], 274, 'Hits');
  assert.ok(findSpotifySongMatch(target, [compilation, original]));

  const bolna = source('Bolna', ['Tanishk Bagchi', 'Arijit Singh', 'Asees Kaur'], 212.832);
  const correct = song('correct', bolna.title, bolna.artists, 213, 'Kapoor & Sons');
  const conflicting = song('conflicting', bolna.title, ['Arijit Singh', 'Asees Kaur', 'Nilesh P.'], 213, 'Hits');
  assert.equal(findSpotifySongMatch(bolna, [conflicting, correct]), correct);
});

test('identically credited album copies tolerate a small silence/duration difference', () => {
  const target = source('Desi Kalakaar', ['Yo Yo Honey Singh'], 253.352, 'Desi Kalakaar');
  const album = song('album', target.title, target.artists, 257, target.album);
  const compilation = song('compilation', target.title, target.artists, 253, 'Hits');
  assert.ok(findSpotifySongMatch(target, [album, compilation]));
});

test('exact spelling, album and duration disambiguate otherwise similar results', () => {
  const kuch = source('Kuchh Khaas', ['Mohit Chauhan', 'Neha Bhasin'], 296.89, 'Fashion');
  const exact = song('exact', 'Kuchh Khaas', kuch.artists, 296, 'Fashion');
  assert.equal(findSpotifySongMatch(kuch, [song('alternate', 'Kuch Khaas', [...kuch.artists].reverse(), 296, 'Fashion'), exact]), exact);
  const finding = source('Finding Her', ['Kushagra', 'Bharath', 'Saaheal'], 207, 'Finding Her');
  const original = song('original', finding.title, ['Kushagra'], 207, 'Finding Her');
  assert.equal(findSpotifySongMatch(finding, [song('different', finding.title, ['Kushagra', 'Bharath'], 219, 'Do That Again'), original]), original);
});

test('same solo artist, album and duration allow a catalogue-only gender label', () => {
  const target = source('Sunn Raha Hai', ['Ankit Tiwari', 'Sandeep Nath'], 390.222, 'Aashiqui 2');
  const male = song('male', 'Sunn Raha Hai (Male)', ['Ankit Tiwari'], 390, 'Aashiqui 2');
  assert.equal(findSpotifySongMatch(target, [male]), male);
  assert.equal(findSpotifySongMatch({ ...target, title: 'Sunn Raha Hai (Female)' }, [male]), null);
  assert.equal(findSpotifySongMatch({ ...target, album: 'Different Album' }, [male]), null);
});

test('acoustic, live, remix, unknown takes and conflicting artists still require a confident match', () => {
  const target = source('Jhol - Acoustic (feat. Asfand)', ['Maanu', 'Annural Khalid', 'Asfand'], 277.6);
  assert.equal(findSpotifySongMatch(target, [song('studio', 'Jhol', target.artists, 277), song('cover', 'Jhol (Acoustic)', ['Other Singer'], 277)]), null);
  const regular = source('A Long Beautiful Song Title', ['Singer'], 180);
  for (const suffix of ['(Live)', '(Remix)', '(Alternate Take)', '- Radio Edit', '(Vocals Only)', '(Female Version)']) {
    assert.equal(findSpotifySongMatch(regular, [song(suffix, `${regular.title} ${suffix}`, ['Singer', 'Other Singer'], 180)]), null, suffix);
  }
  assert.equal(findSpotifySongMatch(regular, [song('a', regular.title, ['Singer', 'Guest'], 180), song('b', regular.title, ['Singer', 'Other'], 180)]), null);
});

test('import search retains separate recordings and uses a distinct cache without altering ordinary search', async () => {
  globalCacheService.clear();
  const original = song('original', 'Test Recording', ['Singer'], 180);
  const alternate = song('female', 'Test Recording (Female Version)', ['Singer'], 181);
  const search = mock.method(JioSaavnProvider.prototype, 'search', async () => [original, alternate]);
  try {
    const music = new MusicService();
    const ordinary = await music.search('Test Recording', 12);
    const importing = await music.search('Test Recording', 12, { preserveRecordings: true });
    assert.deepEqual(ordinary.songs.map(song => song.id), ['original']);
    assert.deepEqual(importing.songs.map(song => song.id), ['original', 'female']);
    assert.equal(search.mock.callCount(), 2);
  } finally { search.mock.restore(); globalCacheService.clear(); }
});
