// Provider protocol fixture: generation tests still exercise search-citation and
// extraction validation without making network calls or trusting invented URLs.
export function withEvidence(sdk:{responses:{create:(request:never)=>Promise<unknown>}}) {
 return {responses:{create:async(request:Record<string,unknown>)=>{
  const format=(request.text as {format?:{name?:string}}|undefined)?.format;
  if((request.tools as {type:string}[]|undefined)?.some(t=>t.type==='web_search'))return {status:'completed',output_text:'General resistance training guidance with population limitations.',output:[{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://acsm.org/education-resources/',title:'ACSM training guidance'}]}]}]};
  if(format?.name==='exercise_guidance')return {status:'completed',output_text:JSON.stringify({sources:[{id:'evidence_1',publishedAt:null,recommendations:['Use conservative progression and controlled technique.'],limitations:['General guidance does not establish individual capacity.'],applicability:'General adult resistance training; Coach review required.'}]})};
  return sdk.responses.create(request as never);
 }}};
}
