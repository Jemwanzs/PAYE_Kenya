# Kenya PAYE & Tax Calculator V3

Open `index.html` in VS Code Live Server or any browser.

Files:
- `index.html` - structure and inputs
- `styles.css` - responsive UI/UX styling
- `script.js` - PAYE, deductions and net pay calculation logic

Defaults used:
- PAYE bands: 10%, 25%, 30%, 32.5%, 35%
- Monthly personal relief: KES 2,400
- SHIF: 2.75% with KES 300 minimum
- AHL: 1.5% employee and 1.5% employer
- NSSF: 6% employee/employer, configurable upper limit default KES 108,000

All statutory rates are configurable directly from the calculator UI.


## Latest update
- Each allowance and benefit now has NSSF, SHIF and AHL impact checkboxes.
- All earning/benefit statutory-impact checkboxes are on by default except one-off allowances and overtime.
- The allowable deductions display now separates `NSSF + pension allowable deductions` from the wider statutory deductions used in taxable pay.
