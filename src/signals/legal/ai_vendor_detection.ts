const VENDORS = [
  "Harvey AI",
  "CoCounsel",
  "Relativity AI",
  "Lexis+ AI",
  "Westlaw Precision AI"
];

export function detectVendors(text:string){
  return VENDORS.filter(v =>
    text.toLowerCase().includes(v.toLowerCase())
  );
}
