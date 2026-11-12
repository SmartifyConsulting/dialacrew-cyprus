export const GIG_DEPARTMENTS = ["Production", "Directing", "Camera", "Lighting", "Grip", "Sound", "Art", "Wardrobe", "Hair & Make-up", "Locations", "Transport", "Catering", "Post-production", "Other"];
export const PHONE_CODES = [
  ["South Africa", "+27"], ["Cyprus", "+357"], ["United Kingdom", "+44"], ["United States", "+1"],
  ["Namibia", "+264"], ["Botswana", "+267"], ["Zimbabwe", "+263"], ["Kenya", "+254"], ["Nigeria", "+234"],
  ["India", "+91"], ["Australia", "+61"], ["Germany", "+49"], ["France", "+33"], ["United Arab Emirates", "+971"],
];
export function internationalPhone(value: string, prefix: string) {
  const clean = value.trim().replace(/[\s().-]/g, "");
  const phone = clean.startsWith("+") ? clean : clean.startsWith("00") ? `+${clean.slice(2)}` : `${prefix}${clean.replace(/^0+/, "")}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error("Enter a valid international contact number (7–15 digits).");
  return phone;
}
