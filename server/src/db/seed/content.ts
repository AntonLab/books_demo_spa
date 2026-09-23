import type { Rng } from './rng.ts';

// The Genre list the demo is browsed by, in the alphabetical order every list
// shows it in anyway. Three of the five are a content bank's; Horror and
// Romance are nobody's on purpose — a demo with no empty Genre never shows what
// one looks like in the header's submenu or on /search?genre=.
export const GENRE_NAMES = [
  'Gothic',
  'Hard SF',
  'Horror',
  'Romance',
  'Urban Fantasy',
] as const;

export interface ContentBank {
  // The Genre every Book and Series drawn from this bank is filed under. A name
  // rather than an id: the rows do not exist while the plan is being built, so
  // writeContent resolves it through the map writeGenres returns. Typed as the
  // union, so a bank cannot name a Genre the seed never creates.
  genreName: (typeof GENRE_NAMES)[number];
  // A pool; each book and series takes 3-5. Two tags appear in more than one
  // bank on purpose, so ?tag= returns more than one author's work.
  tags: readonly string[];
  seriesTitles: readonly string[];
  // Long enough for the maximum an author can reach: 2 series x 5 books plus
  // 3 standalone books is 13.
  bookTitles: readonly string[];
  chapterAdjectives: readonly string[];
  chapterNouns: readonly string[];
  sentences: readonly string[];
}

export const GOTHIC: ContentBank = {
  genreName: 'Gothic',
  tags: ['gothic', 'victorian', 'mystery', 'slow-burn', 'manor', 'epistolary'],
  seriesTitles: ['The Ashgrove Chronicles', 'Letters from Blackmoor'],
  bookTitles: [
    'The Glass Harbour',
    'A Winter at Ashgrove',
    'The Cormorant Stair',
    'Salt and Candlelight',
    'The Quiet Wing',
    'Nine Rooms Facing North',
    'The Widow of Blackmoor',
    'A Debt of Rain',
    'The Locked Orangery',
    'Frost on the Iron Gate',
    "The Lamplighter's Daughter",
    'A House Without Mirrors',
    'The Long Carriage Road',
    'Ash and Aspidistra',
  ],
  chapterAdjectives: [
    'Empty',
    'Locked',
    'Second',
    'Borrowed',
    'Quiet',
    'Hollow',
    'Narrow',
    'Silvered',
    'Bitter',
    'Unlit',
    'Distant',
    'Patient',
    'Crooked',
    'Faded',
    'Northern',
    'Late',
  ],
  chapterNouns: [
    'Stair',
    'Letter',
    'Lantern',
    'Orangery',
    'Frost',
    'Corridor',
    'Bell',
    'Inventory',
    'Threshold',
    'Ledger',
    'Garden',
    'Carriage',
    'Window',
    'Tide',
    'Signature',
    'Portrait',
    'Kitchen',
    'Mourning',
  ],
  sentences: [
    'The house had been shut for eleven years, and it had learned to keep its own counsel.',
    'Rain came off the moor in long grey sheets that made the windows useless.',
    'She counted the candles twice before she trusted herself to speak.',
    'Every door on the north corridor opened inward, which struck her as a decision rather than an accident.',
    'The letter was signed with an initial she had spent a decade trying to forget.',
    'There were forty-one keys on the ring and only thirty-eight locks in the house.',
    'He spoke of the estate the way other men spoke of a debt they intended never to settle.',
    'The frost had got into the orangery and taken the lemon trees with it.',
    'Someone had been in the library, and had been careful enough to leave the dust undisturbed.',
    'She wrote the date at the top of the page and then sat looking at it for a long while.',
    'The bell in the servants’ passage rang once, at an hour when nobody should have been pulling it.',
    'Her aunt believed that grief, properly managed, could be made to keep indefinitely.',
    'The portrait had been turned to face the wall, and the nail was still warm from the moving.',
    'Gulls went over the roof all morning, complaining about the weather on her behalf.',
    'He had the habit of answering a question three sentences after it was asked.',
    'The inventory listed a silver service that no living person in the house had ever seen.',
    'Outside, the carriage road ran two miles without a single turning, as if daring anyone to leave.',
    'She learned to read the household by its noises, and to distrust the quiet ones most.',
    'The fire took badly, the chimney having its own opinions about the wind.',
    'There was salt on the inside of the glass, which meant the storm had been worse than admitted.',
    'His signature had changed between the first page and the last, and not in the way a tired hand changes.',
    'The steward kept two ledgers and was scrupulous in both.',
    'She had not expected the village to be kind, and it was not, and she was grateful for the honesty.',
    'A single lamp burned in the west wing every night, and no one would say who lit it.',
    'The tide came up to the wall at three and went out again as though embarrassed.',
    'He returned the book without comment, which was itself a kind of comment.',
    'The mourning rings had been ordered before the funeral, which is faster than sorrow usually moves.',
    'She found the second stair by feel, in the dark, exactly where the plans said there was none.',
    'There is a particular silence to a room that has just stopped being spoken in.',
    'By the end of the week she had stopped pretending she meant to go home.',
    'The gate had been painted over so many times that the iron beneath it was a rumour.',
    'They dined at seven, and the empty place at the head of the table was laid regardless.',
  ],
};

export const HARD_SF: ContentBank = {
  genreName: 'Hard SF',
  tags: [
    'hard-sf',
    'space',
    'first-contact',
    'mystery',
    'orbital',
    'generation-ship',
  ],
  seriesTitles: ['The Kepler Ledger', 'Cold Equations of Mars'],
  bookTitles: [
    'The Slow Light',
    'Orbit of Small Mercies',
    'Dust on the Third Deck',
    'A Signal Worth Keeping',
    'The Iron Aphelion',
    'Nine Hours to Perihelion',
    'The Last Quiet Vacuum',
    'Ceres Is Not Listening',
    'The Argument from Silence',
    'Half a Gravity',
    'The Long Deceleration',
    'Telemetry for the Dead',
    'A Map of Cold Places',
    'The Second Crew',
  ],
  chapterAdjectives: [
    'Cold',
    'Quiet',
    'Seventh',
    'Redundant',
    'Nominal',
    'Frozen',
    'Distant',
    'Failing',
    'Silent',
    'Hard',
    'Empty',
    'Faint',
    'Precise',
    'Borrowed',
    'Outer',
    'Late',
  ],
  chapterNouns: [
    'Burn',
    'Telemetry',
    'Airlock',
    'Vacuum',
    'Signal',
    'Deck',
    'Aphelion',
    'Checklist',
    'Beacon',
    'Gravity',
    'Transit',
    'Coolant',
    'Manifest',
    'Horizon',
    'Silence',
    'Window',
    'Spectrum',
    'Rotation',
  ],
  sentences: [
    'The burn lasted four minutes and eleven seconds, and every one of them was accounted for in advance.',
    'Telemetry arrived eighty-three minutes late, which was exactly as late as physics required.',
    'She ran the checklist twice, not because she doubted it but because the second run is the one that catches you.',
    'The coolant loop had been losing a gram a day for two years before anyone thought to add it up.',
    'Nothing about the signal was artificial except its timing, and timing was enough.',
    'On the third deck the air smelled of hot dust, which meant a filter had given up quietly.',
    'He had trained for this failure in simulation nine times and had never once liked the ending.',
    'The ship rotated at a fifth of a gravity, and after six months her knees had opinions about it.',
    'They argued about the orbit for an hour, then deferred to the numbers, as they always did.',
    'Vacuum is not silent; it simply refuses to carry anything you would want to hear.',
    'The manifest listed eleven crew and twelve pressure suits, and nobody had ever explained the spare.',
    'Deceleration began on schedule, and the whole hull began to speak in a register she had never heard.',
    'A beacon that repeats is a machine; a beacon that varies is a question.',
    'The window frosted over from the inside, which is the wrong direction for frost.',
    'He wrote the log entry in the flat voice of someone who expects to be read by a board of inquiry.',
    'Consensus on the bridge lasted until the second data packet contradicted the first.',
    'Every redundant system had a single point of failure, and it was usually the cable tray.',
    'She had seen the spectrum before, in a textbook, described as impossible under stellar conditions.',
    'The far side of the station kept a full day of darkness, and the crew went there to be unobserved.',
    'At aphelion the sun was a bright nail head and nothing more.',
    'The reactor ran nominal, which is the most frightening word in the engineering vocabulary.',
    'They had eleven hours of margin and spent three of them deciding how to spend the rest.',
    'The first-contact protocol assumed someone would answer, and said nothing about what to do when nobody did.',
    'Radiation exposure was within limits, the way a cliff edge is within walking distance.',
    'He counted the hull ticks in the dark and reached a number he refused to write down.',
    'The transit window closed at 0400 and would not reopen for nineteen months.',
    'Half the instruments agreed, which is worse than none of them agreeing.',
    'She put her hand flat on the bulkhead and felt the whole ship working on the other side of it.',
    'Their orders had been written by someone eleven light-minutes and four years away.',
    'The silence after the antenna stopped was the loudest thing on board.',
    'Gravity, when they finally had it again, felt like an accusation.',
    'No one had ever tested the airlock against a pressure differential in that direction.',
  ],
};

export const URBAN_FANTASY: ContentBank = {
  genreName: 'Urban Fantasy',
  tags: ['urban-fantasy', 'magic', 'detective', 'slow-burn', 'city', 'wards'],
  seriesTitles: ['The Nightbus Files', 'Wardens of the Third Ward'],
  bookTitles: [
    'Salt Circles and Streetlights',
    'The Tuesday Ghost',
    'A Charm for Bad Tenants',
    'The Rent Collector',
    'Nine Wards of Rain',
    'The Pawnshop at Dawn',
    'Bones of the Old Canal',
    'A Small Honest Curse',
    'The Locksmith of Vine Street',
    'Every Door Says Yes',
    'The Midnight Ledger',
    'A Cat With Opinions',
    'The Quiet Hex',
    'Under the Tram Bridge',
  ],
  chapterAdjectives: [
    'Borrowed',
    'Crooked',
    'Third',
    'Cheap',
    'Quiet',
    'Unlucky',
    'Second',
    'Wet',
    'Small',
    'Honest',
    'Late',
    'Broken',
    'Neon',
    'Patient',
    'Old',
    'Bitter',
  ],
  chapterNouns: [
    'Ward',
    'Streetlight',
    'Contract',
    'Pawnshop',
    'Tram',
    'Circle',
    'Tenant',
    'Ledger',
    'Doorway',
    'Charm',
    'Alley',
    'Receipt',
    'Canal',
    'Keyring',
    'Rain',
    'Favour',
    'Bargain',
    'Landlord',
  ],
  sentences: [
    'The ward on the front door had been repainted so often it no longer matched the building.',
    'Nothing in this city is free, but a surprising amount of it is cheap.',
    'She paid the fare in coins because the nightbus does not take anything that leaves a record.',
    'The contract ran to two pages and the interesting part was the paper.',
    'He kept his charms in a tobacco tin, sorted by how much trouble each one had caused.',
    'Rain got into the salt circle at about two in the morning and that was the end of the quiet.',
    'The pawnshop opened at dawn and closed whenever the owner decided it had.',
    'Her landlord was technically a person, and she had stopped pressing for detail beyond that.',
    'Magic in this part of town is mostly plumbing: old, patched, and nobody wants to look behind the wall.',
    'The tram went over the bridge and for six seconds the whole carriage smelled of the canal.',
    'A favour owed in this neighbourhood accrues interest, and the interest is not money.',
    'He wrote the address on his hand because paper has a way of being read by the wrong people.',
    'The cat had opinions about the client and, as usual, the cat was right.',
    'Streetlights along Vine went out one by one behind her, politely, the way a room stops talking.',
    'She had been a detective for nine years and a warden for two, and the paperwork was worse on the second job.',
    'Every door in the building said yes, which is the single worst thing a door can say.',
    'The ledger recorded debts in a hand that changed with the phase of the moon.',
    'There was a small honest curse on the till and a large dishonest one on the manager.',
    'He drank the coffee for the warmth and not out of any hope about the coffee.',
    'The ghost came on Tuesdays, and was punctual in a way the living rarely manage.',
    'Nobody warded the basement, because nobody had gone down there in thirty years to notice.',
    'She traced the circle in chalk, then went over it in salt, then went over that in swearing.',
    'The receipt was for one item, dated nineteen years ago, and it was still warm.',
    'Half the wards in the Third Ward were keeping something out and the other half were keeping something in.',
    'He asked what it would cost and she told him, and he paid it anyway, which told her plenty.',
    'The canal gives things back eventually, but never in the condition they went in.',
    'A locksmith who works after midnight is not really in the business of locks.',
    'Neon from the takeaway turned the alley the colour of a bad decision.',
    'She had a rule about bargains struck before breakfast and had already broken it twice that week.',
    'The keyring held eleven keys and she could account for six.',
    'Under the tram bridge the air went thin, the way it does at altitude or near a very old promise.',
    'He looked at the sigil for a long moment and said the word landlords use for structural damage.',
  ],
};

// A book's annotation and a series' blurb are drawn from the same banks as the
// prose: the point is that a book page reads coherently, not that the blurb is
// separately authored.
export function description(
  rng: Rng,
  bank: ContentBank,
  count: number
): string {
  return rng.sample(bank.sentences, count).join(' ');
}

function chapterTitle(rng: Rng, bank: ContentBank): string {
  const adjective = rng.pick(bank.chapterAdjectives);
  const noun = rng.pick(bank.chapterNouns);

  // Three shapes rather than one, so twenty-odd titles in a row do not all
  // scan identically.
  switch (rng.int(0, 2)) {
    case 0:
      return `The ${adjective} ${noun}`;
    case 1:
      // A different noun, or "Rain and Rain" turns up.
      return `${noun} and ${rng.pick(bank.chapterNouns.filter((other) => other !== noun))}`;
    default:
      return `${indefiniteArticle(adjective)} ${adjective} ${noun}`;
  }
}

// By the sound, not the letter: the banks hold "Empty" and "Outer", and also
// "Honest", whose h is silent.
function indefiniteArticle(word: string): 'A' | 'An' {
  return /^([AEIOU]|Honest$)/.test(word) ? 'An' : 'A';
}

// Deduplicated within one book only: a repeat across two books of a
// thirteen-book catalogue is plausible, a repeat inside one book is a bug. The
// attempt cap is what stops a small noun pool from looping forever.
export function chapterTitles(
  rng: Rng,
  bank: ContentBank,
  count: number
): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();

  while (titles.length < count) {
    let candidate = chapterTitle(rng, bank);
    for (let attempt = 0; seen.has(candidate) && attempt < 20; attempt += 1) {
      candidate = chapterTitle(rng, bank);
    }
    seen.add(candidate);
    titles.push(candidate);
  }

  return titles;
}

// ~4-6 paragraphs of 4-5 sentences: around 2 KB, which is enough for the
// reader page to scroll and for the layout to be judged, without putting 20 KB
// a row into a MEDIUMTEXT column several hundred times over.
//
// Dealt from one shuffled deck for the whole chapter rather than sampled per
// paragraph: a sentence appearing twice in the same chapter is the kind of
// thing a reader notices immediately. Six paragraphs of five stays inside a
// 32-sentence bank; the loop only refills if a bank shrinks or the ranges grow.
export function chapterText(rng: Rng, bank: ContentBank): string {
  const sizes = Array.from({ length: rng.int(4, 6) }, () => rng.int(4, 5));
  const needed = sizes.reduce((sum, size) => sum + size, 0);

  const deck: string[] = [];
  while (deck.length < needed) {
    deck.push(...rng.shuffle(bank.sentences));
  }

  let taken = 0;
  return sizes
    .map((size) => deck.slice(taken, (taken += size)).join(' '))
    .join('\n\n');
}

export const TOP_LEVEL_COMMENTS: readonly string[] = [
  'Found this last week and read the whole thing in two evenings. The pacing in the middle third is doing something clever.',
  'I keep coming back to the chapter where nothing happens. Somehow that is the one that stuck.',
  'The setting does so much work here without ever stopping to explain itself. More of this please.',
  'Started sceptical, stayed for the dialogue. Whoever taught this author to write silences did well.',
  'Genuinely did not see the turn coming, and on a reread it was signposted three chapters earlier.',
  'This is the third book of theirs I have read and the first one I would hand to someone else.',
  'Small thing, but the chapter titles are doing half the atmospheric work.',
  'Read it out of order by accident and it still held together, which says something.',
  'The middle section drags a little for me, but the ending earns it back.',
  'Every character here wants something specific, which sounds basic until you read the alternative.',
  'Bookmarked the whole thing. Will be very annoyed if the next one takes another year.',
  'I have opinions about the last four chapters and none of them are calm.',
  'Came for the premise, stayed for the minor characters. The steward deserves his own book.',
  'This one made me miss my stop on the way home. Take that as a review.',
  'Not sure the ending lands, but I respect that it commits to something.',
  'The prose is doing a lot with very short sentences and I am here for it.',
  'Recommended to me by someone with terrible taste, and now I owe them an apology.',
  'Reading this slowly on purpose. One chapter a night, like it was meant to be.',
  'There is a line in chapter nine that I have thought about every day since.',
  'Hard to explain why this works. It should not, on paper, and it absolutely does.',
  'I would read four hundred more pages of these people arguing about logistics.',
  'The restraint is the best thing about it. Nothing is oversold.',
  'Took me three attempts to get past the opening and I am glad I did.',
  'Anyone else read this as being about the house rather than the people in it?',
  'Second read, first time noticing how much of the ending is in the first chapter.',
  'Solid, but I liked the earlier series better. This one feels more careful and less alive.',
];

export const REPLY_COMMENTS: readonly string[] = [
  'Agreed, though I would argue the middle is doing setup you only notice later.',
  'Same reaction here. Glad it was not just me.',
  'Completely disagree, and I think the reread makes my case for me.',
  'That line is the one everyone quotes and it deserves it.',
  'Which chapter do you mean? I think we are talking about two different scenes.',
  'This is the reply I came here to write, so I will just agree loudly instead.',
  'Fair, but the pacing complaint applies to the whole genre rather than this book.',
  'You have convinced me to go back and look at it again.',
  'I read it the same way, and then the author said something that made me reconsider.',
  'Not sure about that. The setup is doing more than it looks like on a first pass.',
  'Yes, and it pays off properly, which is rarer than it should be.',
  'Strong take. Wrong, but strong.',
  'Give it to chapter six before deciding. That is where it changes gear.',
  'I had the exact opposite reaction, which is probably the point.',
  'This thread has talked me into a reread.',
  'The minor characters carry it, I think we agree on that much.',
  'Depends what you wanted from it, honestly.',
  'Thanks for putting it this way. I could not work out what bothered me and this is it.',
];
