import { readFileSync } from 'node:fs';

const project = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').trim();
const svelte = readFileSync(new URL('../node_modules/svelte/LICENSE.md', import.meta.url), 'utf8').split(/\r?\n/)[0];

export const licenseBanner = `/*!\n${svelte}\n${project}\n*/`;
