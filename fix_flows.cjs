const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

// Try loading env vars from backend or frontend
if (fs.existsSync('./backend/.env')) {
    dotenv.config({ path: './backend/.env' });
} else {
    dotenv.config(); // try root .env
}

// In case the frontend vite env vars are used
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStuckFlows() {
    console.log("Iniciando correção de fluxos travados...");
    
    // We update all contacts where flow_alert is true OR they have been stuck for some reason
    // But to be safe, let's just clear flow_current_flow_id where it's not null and flow_alert is true
    // Wait, the user specifically mentioned lead 5516997502848. We can clear for that one or all of them.
    // Let's clear all where flow_alert = true
    
    const { data, error } = await supabase
        .from('contacts')
        .update({
            flow_current_flow_id: null,
            flow_current_step_index: null
        })
        .eq('flow_alert', true);
        
    if (error) {
        console.error("Erro ao atualizar:", error);
    } else {
        console.log("Fluxos travados com alerta foram finalizados com sucesso.");
    }
    
    // Also, specifically fix the lead mentioned by the user
    const { data: d2, error: e2 } = await supabase
        .from('contacts')
        .update({
            flow_current_flow_id: null,
            flow_current_step_index: null
        })
        .eq('phone', '5516997502848');
        
    if (e2) {
        console.error("Erro ao corrigir lead específico:", e2);
    } else {
        console.log("Lead 5516997502848 corrigido com sucesso.");
    }
}

fixStuckFlows();
