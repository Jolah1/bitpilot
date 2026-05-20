// Thin shim around @scure/bip39. The library splits the English wordlist
// into a deep-import path; this module re-exports both the wordlist and
// the helpers we use, so the rest of the app stays clean.

export { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
export { wordlist } from '@scure/bip39/wordlists/english'
