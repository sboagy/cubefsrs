export type AlgCase = {
	id: string;
	/** UUID in SQLite / Postgres — undefined until DB is initialized. */
	dbId?: string;
	name: string;
	alg: string;
	recognition?: string;
	mnemonic?: string;
	notes?: string;
};

export type AlgCategory = {
	name: string;
	subsets: { name: string; caseIds: string[] }[];
};

export type AlgCatalog = {
	categories: AlgCategory[];
};
