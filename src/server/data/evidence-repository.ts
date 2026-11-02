import { Dataset } from '../../contracts/evidence.js';
import type { EvidenceRepository } from '../evidence/services.js';

// Read-only SQL is injected by the Node backend. No keys, env loading or signing code here.
export type SqlReader = (query: string) => Promise<string>;
export const DATASET_QUERY = `SELECT json_build_object(
 'schemaVersion',1,'demo',true,'label','Fictional PackProof demonstration data',
 'actors',coalesce((SELECT json_agg(json_build_object('id',id,'kind',kind,'label',public_label,'demo',demo) ORDER BY id) FROM packproof.actors WHERE demo),'[]'::json),
 'records',coalesce((SELECT json_agg(json_build_object('id',id,'jws',jws,'sha256',sha256) ORDER BY id) FROM packproof.signed_records WHERE namespace='packproof-demo'),'[]'::json),
 'products',coalesce((SELECT json_agg(json_build_object('itemId',id,'namespace',namespace,'unitMark',unit_mark,'modelCode',model_code,'batchCode',batch_code,'issuanceRecordId',issuance_record_id,'mappingRecordId',mapping_record_id,'ownerRecordId',owner_record_id,'ownerVersion',owner_version,'registeredOwnerId',registered_owner_id) ORDER BY id) FROM packproof.items WHERE namespace='packproof-demo'),'[]'::json)
);`;
export class PostgresEvidenceRepository implements EvidenceRepository {
  constructor(private readonly read: SqlReader) {}
  async load(): Promise<Dataset> { return Dataset.parse(JSON.parse(await this.read(DATASET_QUERY))); }
}
