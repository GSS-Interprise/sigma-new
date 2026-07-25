import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const extract = (m: any): any => {
  if (m?.conversation) return { text:m.conversation,type:"text" };
  if (m?.extendedTextMessage) return { text:m.extendedTextMessage.text||null,type:"text" };
  if (m?.imageMessage) return { text:m.imageMessage.caption||null,type:"image",url:m.imageMessage.url,mime:m.imageMessage.mimetype,caption:m.imageMessage.caption };
  if (m?.videoMessage) return { text:m.videoMessage.caption||null,type:"video",url:m.videoMessage.url,mime:m.videoMessage.mimetype,caption:m.videoMessage.caption };
  if (m?.audioMessage) return { text:m.audioMessage.ptt?"[Mensagem de voz]":"[Áudio]",type:"audio",url:m.audioMessage.url,mime:m.audioMessage.mimetype };
  if (m?.documentMessage) return { text:`[Documento: ${m.documentMessage.fileName||"arquivo"}]`,type:"document",url:m.documentMessage.url,mime:m.documentMessage.mimetype,filename:m.documentMessage.fileName };
  if (m?.stickerMessage) return { text:"[Sticker]",type:"sticker",url:m.stickerMessage.url,mime:m.stickerMessage.mimetype };
  if (m?.contactMessage) return { text:m.contactMessage.displayName||"[Contato]",type:"contact" };
  if (m?.locationMessage) return { text:"[Localização]",type:"location" };
  return null;
};

serve(async(req)=>{
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const token=(req.headers.get("Authorization")||"").replace("Bearer ","");
  let tokenRole="";
  try{
    const part=(token.split(".")[1]||"").replace(/-/g,"+").replace(/_/g,"/");
    tokenRole=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,"="))).role||"";
  }catch{/* chaves opacas continuam aceitas por igualdade */}
  if(!serviceKey&&tokenRole!=="service_role")
    return Response.json({error:"server_auth_unavailable"},{status:500});
  if(token!==serviceKey&&tokenRole!=="service_role")
    return Response.json({error:"unauthorized"},{status:401});
  const supabase=createClient(Deno.env.get("SUPABASE_URL")||"",serviceKey);
  let claimedInstance:string|null=null;
  try{
    const {data:jobs,error:claimError}=await supabase.rpc("claim_sigzap_history_sync_job");
    if(claimError)throw claimError;
    const job=jobs?.[0]; if(!job)return Response.json({processed:0,reason:"no_due_open_instance"});
    claimedInstance=job.instance_id;
    const {data:cfg,error:cfgError}=await supabase.from("config_lista_items").select("campo_nome,valor").in("campo_nome",["evolution_api_url","evolution_api_key"]);
    if(cfgError)throw cfgError;
    const url=String(cfg?.find((x:any)=>x.campo_nome==="evolution_api_url")?.valor||"").replace(/\/+$/,"");
    const apiKey=String(cfg?.find((x:any)=>x.campo_nome==="evolution_api_key")?.valor||"");
    const page=Math.max(1,Number(job.cursor_page)||1);
    const response=await fetch(`${url}/chat/findMessages/${encodeURIComponent(job.instance_name)}`,{method:"POST",headers:{apikey:apiKey,"Content-Type":"application/json"},body:JSON.stringify({where:{},limit:50,page})});
    if(!response.ok)throw new Error(`Evolution ${response.status}: ${(await response.text()).slice(0,300)}`);
    const payload=await response.json();
    const records=Array.isArray(payload)?payload:(payload?.messages?.records||payload?.records||[]);
    const rows:any[]=[];
    for(const msg of records){
      const key=msg?.key||{};const original=String(key.remoteJid||"");
      if(!original.endsWith("@s.whatsapp.net")&&!original.endsWith("@lid"))continue;
      const jid=original.endsWith("@lid")&&key.remoteJidAlt?String(key.remoteJidAlt):original;
      const phone=jid.replace(/@.*$/,"").replace(/\D/g,"");const content=extract(msg?.message);
      if(!key.id||!phone||!content)continue;
      const seconds=Number(msg.messageTimestamp)||Math.floor(Date.now()/1000);
      rows.push({contact_jid:jid,contact_phone:phone,contact_name:msg.pushName||null,wa_message_id:String(key.id),from_me:key.fromMe===true,
        message_text:content.text,message_type:content.type,message_status:"sent",media_url:content.url||null,media_mime_type:content.mime||null,
        media_caption:content.caption||null,media_filename:content.filename||null,sent_at:new Date(seconds*1000).toISOString(),raw_payload:msg});
    }
    const {data:imported,error:importError}=await supabase.rpc("import_sigzap_history_rows",{p_instance_id:job.instance_id,p_instance_name:job.instance_name,p_rows:rows});
    if(importError)throw importError;
    const hasMore=records.length===50;
    await supabase.from("sigzap_history_sync_jobs").update({cursor_page:hasMore?page+1:1,status:hasMore?"catchup":"live",
      next_run_at:new Date(Date.now()+(hasMore?60000:300000)).toISOString(),last_completed_at:hasMore?null:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("instance_id",job.instance_id);
    return Response.json({processed:1,instance:job.instance_name,page,seen:records.length,normalized:rows.length,imported:Number(imported)||0,has_more:hasMore});
  }catch(error){
    if(claimedInstance)await supabase.from("sigzap_history_sync_jobs").update({status:"error",next_run_at:new Date(Date.now()+300000).toISOString(),last_error:(error instanceof Error?error.message:JSON.stringify(error)).slice(0,1000),updated_at:new Date().toISOString()}).eq("instance_id",claimedInstance);
    return Response.json({error:error instanceof Error?error.message:JSON.stringify(error)},{status:500});
  }
});
