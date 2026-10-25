// Edge-safe filename allowlist. File content is stored in SQLite, never written to public/.
export function isVerificationFilename(filename: string) { return /^google[a-f0-9]{8,64}\.html$/.test(filename) || filename==='ads.txt' || filename==='BingSiteAuth.xml'; }
