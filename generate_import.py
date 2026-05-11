import csv
import re

csv_path = 'CLIENTES VETTORE - Página1.csv'
sql_path = 'database/import_gavinacao_contacts.sql'

print(f'Lendo {csv_path}...')

with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    
    with open(sql_path, 'w', encoding='utf-8') as out:
        out.write('-- ==========================================================\n')
        out.write('-- IMPORTAÇÃO DE CONTATOS - GAVINACAO\n')
        out.write('-- Rode este script no SQL Editor do Supabase\n')
        out.write('-- ==========================================================\n\n')
        
        out.write('DO $import_script$\n')
        out.write('DECLARE\n')
        out.write('  v_company_id uuid;\n')
        out.write('BEGIN\n')
        out.write('  -- Pega a empresa do Gavinacao\n')
        out.write('  SELECT company_id INTO v_company_id FROM public.users WHERE email = \'gavinacao@gmail.com\' LIMIT 1;\n\n')
        out.write('  IF v_company_id IS NULL THEN\n')
        out.write('    RAISE EXCEPTION \'Empresa do Gavinacao nao encontrada!\';\n')
        out.write('  END IF;\n\n')
        
        count = 0
        for row in reader:
            phone = row.get('TEL', '').strip()
            name = row.get('NOME', '').strip()
            
            # Limpa o telefone
            phone = re.sub(r'\D', '', phone)
            if not phone:
                continue
                
            # Formata as notas com os outros campos
            notes_parts = []
            if row.get('ENDEREÇO'): notes_parts.append(f"Endereço: {row['ENDEREÇO']}")
            if row.get('OBSERVAÇÃOES'): notes_parts.append(f"Obs: {row['OBSERVAÇÃOES']}")
            if row.get('NIVEL'): notes_parts.append(f"Nível: {row['NIVEL']}")
            if row.get('STATUS'): notes_parts.append(f"Status: {row['STATUS']}")
            if row.get('RETORNO'): notes_parts.append(f"Retorno: {row['RETORNO']}")
            if row.get('ORÇAMENTO ENVIADO'): notes_parts.append(f"Orçamento: {row['ORÇAMENTO ENVIADO']}")
            
            notes = ' | '.join(notes_parts)
            # Escape single quotes
            name_escaped = name.replace("'", "''")
            notes_escaped = notes.replace("'", "''")
            
            sql = f"  INSERT INTO public.contacts (company_id, phone, name, notes) VALUES (v_company_id, '{phone}', '{name_escaped}', '{notes_escaped}') ON CONFLICT (company_id, phone) DO UPDATE SET notes = EXCLUDED.notes, name = EXCLUDED.name;\n"
            out.write(sql)
            count += 1
            
        out.write('END $import_script$;\n')
        print(f'Sucesso! {count} contatos gerados no script {sql_path}')
