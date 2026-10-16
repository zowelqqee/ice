// Class strings shared by the admin's server and client components (no imports: safe in both).
export const btn =
  "inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
export const btnPrimary = `${btn} border-[#5cf2ff] bg-[#5cf2ff] text-[#04121a] hover:bg-[#8ff6ff]`;
export const btnGhost = `${btn} border-[#2a3a52] text-[#e6edf5] hover:border-[#5cf2ff] hover:text-white`;
export const btnDanger = `${btn} border-[#5a2630] text-[#ff9aa8] hover:border-[#ff6b80] hover:text-white`;

export const label = "mb-1.5 block text-sm text-[#c9d6e3]";
export const field =
  "block w-full rounded-md border border-[#2a3a52] bg-[#0c121b] px-3 py-2.5 text-[16px] text-[#e6edf5] placeholder:text-[#5d7088] focus:border-[#5cf2ff] focus:outline-none sm:text-[15px] [color-scheme:dark]";
export const fieldError = "border-[#ff6b80]";
export const hint = "mt-1 text-xs text-[#8fa3b8]";
export const errorText = "mt-1 text-sm text-[#ff9aa8]";
