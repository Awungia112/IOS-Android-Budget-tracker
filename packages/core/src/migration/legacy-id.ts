import { v5 as uuidv5 } from 'uuid';

const LEGACY_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function legacyIdToUuid(entityType: string, legacyId: number | string): string {
  return uuidv5(`${entityType}:${legacyId}`, LEGACY_ID_NAMESPACE);
}
