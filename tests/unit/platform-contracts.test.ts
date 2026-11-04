import {describe,it,expect} from 'vitest';
import {AccountType,ProductDraftInput,ProfileInput,EvidenceLinkInput} from '../../src/contracts/platform.js';
import {API_OPERATIONS,NoticeEvent} from '../../src/contracts/api-v1.js';
describe('platform contracts',()=>{
 it('has exactly two account types and no selectable issuer grant',()=>{expect(AccountType.options).toEqual(['manufacturer','regular']);for(const accountType of ['seller','buyer','distributor','issuer'])expect(ProfileInput.safeParse({accountType,displayName:'Participant'}).success).toBe(false);expect(ProfileInput.safeParse({accountType:'manufacturer',displayName:'Producer',issuer:true}).success).toBe(false);});
 it('preserves literal identifiers and requires distinct unit marks',()=>{const draft={name:'Sample',description:'',producer:'Producer',scope:'unit',modelCode:'001',batchCode:'002',productMark:'0003',packagingMark:'0004',containerMark:null,printedExpiry:null};expect(ProductDraftInput.parse(draft).productMark).toBe('0003');expect(ProductDraftInput.safeParse({...draft,packagingMark:'0003'}).success).toBe(false);expect(ProductDraftInput.safeParse({...draft,productMark:3}).success).toBe(false);});
 it('does not expose autonomous ownership commits',()=>{expect(Object.keys(API_OPERATIONS)).not.toContain('transfers.confirm');expect(API_OPERATIONS['transfers.propose'].publicRead).toBe(false);expect(NoticeEvent.safeParse({type:'history_gap'}).success).toBe(false);expect(EvidenceLinkInput.safeParse({}).success).toBe(false);});
});
