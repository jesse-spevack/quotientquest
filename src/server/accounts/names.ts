import { randomItem } from "./crypto";
import { NAME_ADJECTIVES, NAME_ANIMALS, NAME_PLACES } from "./nameWords";

const NAME_OFFER_SIZE = 3;

export function offerNames(): string[] {
  const names = new Set<string>();
  while (names.size < NAME_OFFER_SIZE) {
    names.add([randomItem(NAME_ADJECTIVES), randomItem(NAME_PLACES), randomItem(NAME_ANIMALS)].join(" "));
  }
  return [...names];
}

export function isPlayerName(name: string): boolean {
  const [adjective, place, animal, ...rest] = name.split(" ");
  return (
    rest.length === 0 &&
    adjective !== undefined &&
    place !== undefined &&
    animal !== undefined &&
    NAME_ADJECTIVES.includes(adjective) &&
    NAME_PLACES.includes(place) &&
    NAME_ANIMALS.includes(animal)
  );
}
