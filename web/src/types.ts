export type Gender = "male" | "female" | "other" | "unknown";
export type RelType = "parent" | "child" | "partner" | "sibling";

export interface Person {
  id: string;
  first: string;
  last: string;
  birth: string;
  death: string;
  gender: Gender;
  place: string;
  occupation: string;
  notes: string;
  /** A data: URL, or null when there is no photo. */
  photo: string | null;
  x: number;
  y: number;
}

/** "parent": a is the parent of b. "child": a is the child of b. */
export interface Relationship {
  a: string;
  b: string;
  type: RelType;
}

export interface Tree {
  people: Record<string, Person>;
  /** In the order they were added; marriages are numbered by this order. */
  relationships: Relationship[];
}

export type View = "canvas" | "gen" | "list";
