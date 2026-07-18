// Authoritative price list — keep in sync with the client copy in auth.js.
const DAY_PACKAGES = [
  { days: 1, amount: 200 },
  { days: 2, amount: 400 },
  { days: 3, amount: 500 },
  { days: 4, amount: 600 },
  { days: 5, amount: 700 },
  { days: 15, amount: 1500 },
  { days: 30, amount: 2800 },
  { days: 90, amount: 8000 },
  { days: 180, amount: 15000 },
  { days: 365, amount: 28000 }
];

const DAY_MS = 24 * 60 * 60 * 1000;

function amountForDays(days) {
  const pack = DAY_PACKAGES.find(p => p.days === days);
  return pack ? pack.amount : null;
}

module.exports = { DAY_PACKAGES, DAY_MS, amountForDays };
