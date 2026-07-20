const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const config = `// Generado automáticamente por build.js — NO editar manualmente
window.SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
window.SUPABASE_KEY = ${JSON.stringify(SUPABASE_KEY)};
`;

fs.writeFileSync('config.js', config);
console.log('config.js generado correctamente.');
