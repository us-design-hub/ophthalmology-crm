import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { canonicalJson,contentHash } from '../src/server/clinical-hash';
import { EMPTY_DRAWINGS,eventInputSchema,rxInputSchema,prescriptionWarnings,examinationTemplateDefinitionSchema,validateExaminationAnswers,type RxItem } from '../src/lib/clinical';
import { ROLE_PERMISSIONS } from '../src/lib/access';
import { clinicalMarkersForTemplate,suggestedDrawingSection } from '../src/lib/clinical-drawing';
import { historyEntryInputSchema } from '../src/lib/patient-history';
test('content hashes are independent of object insertion order but preserve laterality and row order',()=>{assert.equal(contentHash({a:1,b:{x:'OD',y:2}}),contentHash({b:{y:2,x:'OD'},a:1}));assert.notEqual(contentHash({eye:'OD'}),contentHash({eye:'OS'}));assert.notEqual(contentHash(['OD','OS']),contentHash(['OS','OD']));assert.equal(canonicalJson({when:new Date('2026-09-14T00:00:00Z')}),'{"when":"2026-09-14T00:00:00.000Z"}');});
test('event validation rejects missing laterality, duplicate anatomy pairs and injected signing fields',()=>{const plan={id:randomUUID(),eye:'OD',anatomySite:'optic_nerve',intent:'observation',notes:''};const input={encounterId:randomUUID(),version:0,complaint:'Demo',findings:{OD:'Right',OS:'Left'},diagnoses:[{eye:'OU',label:'Demo diagnosis'}],plans:[plan],referral:'',followUp:'',drawings:structuredClone(EMPTY_DRAWINGS)};assert.equal(eventInputSchema.safeParse(input).success,true);assert.equal(eventInputSchema.safeParse({...input,status:'signed'}).success,false);assert.equal(eventInputSchema.safeParse({...input,plans:[plan,{...plan,id:randomUUID()}]}).success,false);assert.equal(eventInputSchema.safeParse({...input,diagnoses:[{label:'Missing eye'}]}).success,false);});
test('structured history validates status dates and ophthalmic laterality',()=>{const active={action:'history' as const,category:'ocular' as const,title:'Primary open-angle glaucoma',status:'active' as const,laterality:'OU' as const,onsetDate:'2024-02-01',resolvedDate:'',text:'Treated with topical therapy.',supersedesId:null};assert.equal(historyEntryInputSchema.safeParse(active).success,true);assert.equal(historyEntryInputSchema.safeParse({...active,status:'resolved',resolvedDate:'2024-01-01'}).success,false);assert.equal(historyEntryInputSchema.safeParse({...active,status:'resolved',resolvedDate:''}).success,false);assert.equal(historyEntryInputSchema.safeParse({...active,laterality:'LEFT'}).success,false);});
const item:RxItem={id:randomUUID(),drugId:randomUUID(),name:'Example',strength:'Demo',eye:'OD',dose:'Demo dose',route:'Demo route',frequency:'Demo frequency',duration:'Demo duration',instructions:'',instructionsUr:'ØµØ±Ù Ù†Ù…ÙˆÙ†Û',taperSchedule:[]};
test('prescription entry requires explicit medication directions and preserves Urdu text',()=>{const data={encounterId:randomUUID(),version:0,items:[item]};assert.equal(rxInputSchema.parse(data).items[0].instructionsUr,item.instructionsUr);assert.equal(rxInputSchema.safeParse({...data,items:[{...item,dose:''}]}).success,false);assert.equal(rxInputSchema.safeParse({...data,signedBy:randomUUID()}).success,false);});
test('taper schedules require complete bounded sequential dose periods',()=>{const input={encounterId:randomUUID(),version:0,items:[{...item,taperSchedule:[{dose:'1 drop',frequency:'four times daily',duration:'7 days',instructions:'Then reduce'}]}]};assert.equal(rxInputSchema.safeParse(input).success,true);assert.equal(rxInputSchema.safeParse({...input,items:[{...item,taperSchedule:[{dose:'',frequency:'daily',duration:'7 days',instructions:''}]}]}).success,false);assert.equal(rxInputSchema.safeParse({...input,items:[{...item,taperSchedule:Array.from({length:13},()=>({dose:'1 drop',frequency:'daily',duration:'1 day',instructions:''}))}]}).success,false);});
test('warning review differentiates separate eyes from overlapping duplicate therapy',()=>{assert.deepEqual(prescriptionWarnings([item,{...item,id:randomUUID(),eye:'OS'}],[]),[]);assert.deepEqual(prescriptionWarnings([item,{...item,id:randomUUID(),eye:'OU'}],[]),['duplicateTherapyReview']);assert.deepEqual(prescriptionWarnings([{...item,drugId:null}],[{type:'allergy',value:'Needs reconciliation'}]),['allergyReview','nonFormularyReview']);});
test('prescribing and signing are restricted to doctors and retired pharmacy access is empty',()=>{for(const role of ['receptionist','nurse','hospital_admin','pharmacist'] as const)assert.equal(ROLE_PERMISSIONS[role].includes('clinical:sign'),false);assert.ok(ROLE_PERMISSIONS.doctor.includes('clinical:sign'));assert.deepEqual(ROLE_PERMISSIONS.pharmacist,[]);});

test('clinical drawings validate bounded stylus paths and reject injected SVG content',()=>{const valid=structuredClone(EMPTY_DRAWINGS);valid.OD.strokes.push({id:randomUUID(),color:'#7f1d1d',width:6,points:[[10,20],[30,40]]});const base={encounterId:randomUUID(),version:0,complaint:'Demo',findings:{OD:'Right',OS:'Left'},diagnoses:[{eye:'OU',label:'Demo'}],plans:[],referral:'',followUp:'',drawings:valid};assert.equal(eventInputSchema.safeParse(base).success,true);assert.equal(eventInputSchema.safeParse({...base,drawings:{...valid,OD:{...valid.OD,strokes:[{...valid.OD.strokes[0],color:'url(javascript:bad)'}]}}}).success,false);assert.equal(eventInputSchema.safeParse({...base,drawings:{...valid,OS:{...valid.OS,template:'uploaded-html'}}}).success,false);});


test('examination templates enforce unique fields, laterality, required values and select options',()=>{
 const definition={sections:[{id:'ocular_exam',title:'Ocular examination',fields:[
  {id:'fundus',label:'Fundus',type:'textarea',laterality:'bilateral',required:true,maxLength:100},
  {id:'outcome',label:'Outcome',type:'select',laterality:'none',required:false,options:['Follow-up','Discharge']},
  {id:'cup_disc_ratio',label:'Cup-to-disc ratio',type:'number',laterality:'bilateral',required:false,min:0,max:1,step:0.05},
 ]}]};
 const template=examinationTemplateDefinitionSchema.parse(definition);
 assert.deepEqual(validateExaminationAnswers(template,{fundus:{OD:'Normal',OS:'Normal'},outcome:'Follow-up',cup_disc_ratio:{OD:0.4,OS:0.5}}),[]);
 assert.ok(validateExaminationAnswers(template,{fundus:{OD:'',OS:'Normal'},outcome:'Unknown'}).includes('fundus:required'));
 assert.ok(validateExaminationAnswers(template,{fundus:'Normal'}).includes('fundus:laterality'));
 assert.ok(validateExaminationAnswers(template,{fundus:{OD:'Normal',OS:'Normal'},unexpected:'value'}).includes('unexpected:unknown'));
 assert.ok(validateExaminationAnswers(template,{fundus:{OD:'Normal',OS:'Normal'},cup_disc_ratio:{OD:-0.05,OS:1.05}}).includes('cup_disc_ratio:min'));
 assert.ok(validateExaminationAnswers(template,{fundus:{OD:'Normal',OS:'Normal'},cup_disc_ratio:{OD:-0.05,OS:1.05}}).includes('cup_disc_ratio:max'));
 assert.equal(examinationTemplateDefinitionSchema.safeParse({sections:[...definition.sections,{id:'duplicate',title:'Duplicate',fields:[definition.sections[0].fields[0]]}]}).success,false);
 assert.equal(examinationTemplateDefinitionSchema.safeParse({sections:[{id:'bad',title:'Bad',fields:[{id:'text',label:'Text',type:'text',laterality:'none',required:false,min:0}]}]}).success,false);
 assert.equal(examinationTemplateDefinitionSchema.safeParse({sections:[{id:'bad',title:'Bad',fields:[{id:'number',label:'Number',type:'number',laterality:'none',required:false,min:2,max:1}]}]}).success,false);
});


test('examination templates apply role visibility and conditional field rules',()=>{
 const template=examinationTemplateDefinitionSchema.parse({sections:[{id:'outcome',title:'Outcome',fields:[
  {id:'visit_outcome',label:'Visit outcome',type:'select',laterality:'none',required:true,options:['Follow-up','Discharge']},
  {id:'recall_interval',label:'Recall interval',type:'text',laterality:'none',required:true,roles:['doctor'],visibleWhen:{fieldId:'visit_outcome',operator:'equals',value:'Follow-up'}},
  {id:'handoff_note',label:'Handoff note',type:'textarea',laterality:'none',required:true,roles:['nurse']},
 ]}]});
 assert.deepEqual(validateExaminationAnswers(template,{visit_outcome:'Discharge'},['doctor']),[]);
 assert.ok(validateExaminationAnswers(template,{visit_outcome:'Follow-up'},['doctor']).includes('recall_interval:required'));
 assert.ok(validateExaminationAnswers(template,{visit_outcome:'Discharge',recall_interval:'3 months'},['doctor']).includes('recall_interval:hidden'));
 assert.ok(validateExaminationAnswers(template,{visit_outcome:'Follow-up',recall_interval:'3 months',handoff_note:'Not permitted'},['doctor']).includes('handoff_note:hidden'));
 assert.equal(examinationTemplateDefinitionSchema.safeParse({sections:[{id:'bad',title:'Bad',fields:[
  {id:'dependent',label:'Dependent',type:'text',laterality:'none',required:false,visibleWhen:{fieldId:'later',operator:'answered'}},
  {id:'later',label:'Later',type:'text',laterality:'none',required:false},
 ]}]}).success,false);
});


test('conditional template rules reject incompatible controller options, types and roles',()=>{
 const base={sections:[{id:'rules',title:'Rules',fields:[
  {id:'outcome',label:'Outcome',type:'select',laterality:'none',required:false,options:['Follow-up'],roles:['doctor']},
  {id:'detail',label:'Detail',type:'text',laterality:'none',required:false,roles:['doctor'],visibleWhen:{fieldId:'outcome',operator:'equals',value:'Follow-up'}},
 ]}]};
 assert.equal(examinationTemplateDefinitionSchema.safeParse(base).success,true);
 const unknownOption:any=structuredClone(base);unknownOption.sections[0].fields[1].visibleWhen.value='Discharge';
 assert.equal(examinationTemplateDefinitionSchema.safeParse(unknownOption).success,false);
 const wrongType:any=structuredClone(base);wrongType.sections[0].fields[1].visibleWhen.value=true;
 assert.equal(examinationTemplateDefinitionSchema.safeParse(wrongType).success,false);
 const hiddenController:any=structuredClone(base);hiddenController.sections[0].fields[1].roles=['doctor','nurse'];
 assert.equal(examinationTemplateDefinitionSchema.safeParse(hiddenController).success,false);
});


test('structured clinical markers enforce catalogue, template and placement bounds',()=>{
 const valid=structuredClone(EMPTY_DRAWINGS);
 valid.OD.markers.push({id:randomUUID(),type:'retinal_tear',x:720,y:130,size:42,rotation:25,label:'Superior temporal tear'});
 const base={encounterId:randomUUID(),version:0,complaint:'Demo',findings:{OD:'Right',OS:'Left'},diagnoses:[{eye:'OD',label:'Retinal tear'}],plans:[],referral:'',followUp:'',drawings:valid};
 assert.equal(eventInputSchema.safeParse(base).success,true);
 assert.ok(clinicalMarkersForTemplate('fundus').some(marker=>marker.type==='retinal_tear'));
 assert.ok(clinicalMarkersForTemplate('fundus').some(marker=>marker.type==='retinal_neovascularisation'));
 assert.ok(clinicalMarkersForTemplate('fundus').some(marker=>marker.type==='retinal_detachment'));
 assert.equal(eventInputSchema.safeParse({...base,drawings:{...valid,OD:{...valid.OD,markers:[{...valid.OD.markers[0],type:'script'}]}}}).success,false);
 assert.equal(eventInputSchema.safeParse({...base,drawings:{...valid,OD:{...valid.OD,markers:[{...valid.OD.markers[0],x:1001}]}}}).success,false);
 assert.equal(eventInputSchema.safeParse({...base,drawings:{...valid,OD:{...valid.OD,template:'anterior'}}}).success,false);
});


test('drawing sheets bind fundus and anterior views to the matching examination section',()=>{
 const sections=[{id:'visit_history',title:'Presenting complaint'},{id:'anterior_segment',title:'Anterior segment examination'},{id:'posterior_segment',title:'Posterior segment and motility'}];
 assert.equal(suggestedDrawingSection(sections,'fundus').id,'posterior_segment');
 assert.equal(suggestedDrawingSection(sections,'anterior').id,'anterior_segment');
 assert.equal(suggestedDrawingSection([{id:'retina_history',title:'Retina history and risk'},{id:'retina_examination',title:'Vitreous, macula and peripheral retina'}],'fundus').id,'retina_examination');
 assert.equal(suggestedDrawingSection([], 'blank').id,'clinical_drawing');
});
