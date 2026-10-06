// Dev-only convenience accounts for manual testing. Never referenced outside
// import.meta.env.DEV — this file ships in dev builds only via that guard.
// `password: null` accounts (e.g. your real admin login) prompt once per
// browser session and cache in sessionStorage — never written to disk/git.
export const DEV_ACCOUNTS: { label: string; email: string; password: string | null }[] = [
  { label: "Admin", email: "info@georgiaadams.co.za", password: null },
  { label: "Production team", email: "dev-producer@bookacrew.test", password: "DevTest123!" },
  { label: "Crew", email: "dev-crew@bookacrew.test", password: "DevTest123!" },
];
