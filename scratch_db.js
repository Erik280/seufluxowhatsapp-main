const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Try to read .env
const env = dotenv.parse(fs.readFileSync('./backend/.env'));

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: contacts, error: errC } = await supabase.from('contacts').select('id, name, phone, stage_id').eq('phone', '5511966422074');
  console.log('Contacts:', contacts);

  const { data: stages, error: errS } = await supabase.from('kanban_stages').select('id, name');
  console.log('Stages:', stages);
  
  if (contacts && contacts.length > 0 && contacts[0].stage_id) {
    const stageId = contacts[0].stage_id;
    const stage = stages.find(s => s.id === stageId);
    console.log('Contact stage name:', stage ? stage.name : 'STAGE NOT FOUND IN DB');
  }
}
run();
