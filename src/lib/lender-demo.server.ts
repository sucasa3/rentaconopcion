// Server-only helpers for generating a deterministic 250-client demo book.

type DemoClient = {
  client_name: string;
  client_email: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  close_date: string; // YYYY-MM-DD
  loan_amount_at_close_cents: number;
  rate_at_close: number;
  term_months: number;
  notes: string | null;
};

const CITIES: Array<{ city: string; state: string; zip: string }> = [
  { city: "Atlanta", state: "GA", zip: "30303" },
  { city: "Marietta", state: "GA", zip: "30060" },
  { city: "Stone Mountain", state: "GA", zip: "30087" },
  { city: "Alpharetta", state: "GA", zip: "30004" },
  { city: "Decatur", state: "GA", zip: "30030" },
  { city: "Orlando", state: "FL", zip: "32801" },
  { city: "Tampa", state: "FL", zip: "33602" },
  { city: "Miami", state: "FL", zip: "33130" },
  { city: "Jacksonville", state: "FL", zip: "32202" },
  { city: "Austin", state: "TX", zip: "78701" },
  { city: "Dallas", state: "TX", zip: "75201" },
  { city: "Houston", state: "TX", zip: "77002" },
  { city: "San Antonio", state: "TX", zip: "78205" },
  { city: "Charlotte", state: "NC", zip: "28202" },
  { city: "Raleigh", state: "NC", zip: "27601" },
  { city: "Durham", state: "NC", zip: "27701" },
  { city: "Phoenix", state: "AZ", zip: "85003" },
  { city: "Scottsdale", state: "AZ", zip: "85251" },
  { city: "Mesa", state: "AZ", zip: "85201" },
  { city: "Tucson", state: "AZ", zip: "85701" },
];

const FIRST = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph",
  "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy",
  "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Sandra", "Mark", "Ashley",
  "Donald", "Kimberly", "Steven", "Emily", "Paul", "Donna", "Andrew", "Michelle",
  "Joshua", "Carol", "Kenneth", "Amanda", "Kevin", "Melissa", "Brian", "Deborah",
  "George", "Stephanie", "Timothy", "Rebecca", "Ronald", "Laura", "Jason",
  "Sharon", "Edward", "Cynthia", "Jeffrey", "Kathleen", "Ryan", "Amy",
  "Jacob", "Angela", "Gary", "Shirley", "Nicholas", "Anna", "Eric", "Ruth",
  "Jonathan", "Brenda", "Stephen", "Pamela", "Larry", "Nicole", "Justin",
  "Katherine", "Scott", "Virginia", "Brandon", "Catherine", "Benjamin", "Christine",
  "Samuel", "Samantha", "Gregory", "Debra", "Frank", "Rachel", "Alexander",
  "Carolyn", "Raymond", "Janet", "Patrick", "Maria", "Jack", "Diane",
  "Dennis", "Julie", "Jerry", "Joyce", "Tyler", "Victoria",
];

const LAST = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
  "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee",
  "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez",
  "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright",
  "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
  "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter",
  "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker",
  "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales",
  "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper",
  "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim",
  "Cox", "Ward", "Richardson", "Watson", "Brooks", "Chavez", "Wood",
  "James", "Bennett", "Gray", "Mendoza", "Ruiz", "Hughes", "Price",
  "Alvarez", "Castillo", "Sanders", "Patel", "Myers", "Long", "Ross",
];

const STREETS = [
  "Oak", "Maple", "Cedar", "Pine", "Elm", "Birch", "Willow", "Chestnut",
  "Sycamore", "Magnolia", "Poplar", "Cypress", "Hawthorn", "Redwood", "Aspen",
  "Sunset", "Sunrise", "Highland", "Ridge", "Lakeview", "Riverside", "Parkside",
  "Meadow", "Hillcrest", "Brookside", "Fairview", "Silverleaf", "Ironwood",
  "Stonebridge", "Gunstock", "Autumn", "Spring", "Winter", "Summit",
];

const SUFFIX = ["Dr", "Ln", "Ct", "Rd", "Ave", "St", "Way", "Blvd", "Ter", "Pl"];

// Mulberry32 deterministic PRNG.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng: () => number, lo: number, hi: number) {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function randFloat(rng: () => number, lo: number, hi: number, decimals = 3) {
  const v = rng() * (hi - lo) + lo;
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
}

export function generateDemoClients(count = 250, seed = 20260727): DemoClient[] {
  const rng = makeRng(seed);
  const out: DemoClient[] = [];
  for (let i = 0; i < count; i++) {
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    const name = `${first} ${last}`;
    const loc = pick(rng, CITIES);
    const streetNum = randInt(rng, 100, 9899);
    const street = pick(rng, STREETS);
    const suffix = pick(rng, SUFFIX);
    // Close date between 2019-01-01 and 2025-06-30.
    const startMs = Date.UTC(2019, 0, 1);
    const endMs = Date.UTC(2025, 5, 30);
    const closeDate = new Date(startMs + rng() * (endMs - startMs));
    const iso = closeDate.toISOString().slice(0, 10);
    // Rate distribution matches the historical era of the close date:
    // 2020–2021 got the deepest rates, 2022+ climbed sharply.
    const year = closeDate.getUTCFullYear();
    let rate: number;
    if (year <= 2020) rate = randFloat(rng, 2.75, 4.0);
    else if (year === 2021) rate = randFloat(rng, 2.65, 3.75);
    else if (year === 2022) rate = randFloat(rng, 3.5, 6.25);
    else if (year === 2023) rate = randFloat(rng, 5.75, 7.5);
    else if (year === 2024) rate = randFloat(rng, 6.25, 7.75);
    else rate = randFloat(rng, 6.0, 7.25);
    const loan = randInt(rng, 180_000, 820_000);
    const term = pick(rng, [360, 360, 360, 360, 180, 240]);
    out.push({
      client_name: name,
      client_email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      address_line1: `${streetNum} ${street} ${suffix}`,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      close_date: iso,
      loan_amount_at_close_cents: loan * 100,
      rate_at_close: rate,
      term_months: term,
      notes: null,
    });
  }
  return out;
}
