#!/usr/bin/env node
/*
 * verificar.js — comprobaciones automáticas de las rebatidas de index.html
 *
 *   node verificar.js
 *
 * No necesita dependencias. Devuelve código de salida 1 si hay algún ERROR,
 * para poder engancharlo a un hook de git o a un CI. Los AVISOS no bloquean:
 * señalan cosas que tiene que mirar una persona.
 *
 * Cada comprobación existe porque el fallo que detecta ya ocurrió de verdad
 * durante las revisiones de 2026. El comentario de cada bloque explica cuál fue.
 *
 * La longitud de las respuestas NO es una regla: se decidió no limitarla.
 */

const fs = require('fs');
const path = require('path');

const FICHERO = path.join(__dirname, 'index.html');
const html = fs.readFileSync(FICHERO, 'utf8');

const fallos = [];
const avisos = [];
const fallo = m => fallos.push(m);
const aviso = m => avisos.push(m);

// Si no se pueden leer los bloques de datos no tiene sentido seguir: la app
// tampoco arrancaría.
function bloqueJSON(id) {
  const m = html.match(new RegExp('id="' + id + '">\\n([\\s\\S]*?)\\n<\\/script>'));
  if (!m) { console.log(`✗ No encuentro el bloque <script id="${id}">`); process.exit(1); }
  try { return JSON.parse(m[1]); }
  catch (e) { console.log(`✗ El bloque ${id} no es JSON válido: ${e.message}`); process.exit(1); }
}
const vars = bloqueJSON('obj-vars');
const data = bloqueJSON('obj-data');

// La app interpola con [^}]+, no con \w+: una variable con acento se buscaría mal
const render = t => (t || '').replace(/\{\{([^}]+)\}\}/g, (m, k) => vars['{{' + k + '}}'] ?? ' ROTA ');
const palabras = t => render(t).split(/\s+/).filter(Boolean).length;

const PREFIJO = { AECC: 'aecc_', CR: 'cr_', AI: 'ai_', FJC: 'fjc_', FEC: 'fec_', FPM: 'fpm_', WWF: 'wwf_' };
const CAMPOS = ['q', 'a', 'short', 'tip'];
const OPCIONALES = ['chuletaTerritorial'];
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Catálogos tal y como los declara el propio código de la app
function catalogo(nombre) {
  const out = {};
  const m = html.match(new RegExp('var ' + nombre + ' = \\[([\\s\\S]*?)\\];'));
  if (!m) { console.log(`✗ No encuentro el array ${nombre} en el código`); process.exit(1); }
  m[1].split('\n').forEach(l => {
    const r = l.match(/id:'([^']+)',\s*label:'([^']+)',\s*color:'([^']+)'/);
    if (r && r[1] !== 'all') out[r[1]] = { label: r[2], color: r[3] };
  });
  return out;
}
const CATS = catalogo('CATS');
const ONGS = catalogo('ONGS');

// Todos los textos de una ficha, incluida la chuleta territorial de wwf14,
// para que las comprobaciones de contenido no se salten ningún campo.
function textos(d) {
  const out = CAMPOS.filter(c => typeof d[c] === 'string').map(c => [c, d[c]]);
  (Array.isArray(d.chuletaTerritorial) ? d.chuletaTerritorial : []).forEach((r, i) => {
    ['texto', 'apoyo'].forEach(k => { if (typeof r[k] === 'string') out.push([`chuleta[${i}].${k}`, r[k]]); });
    (Array.isArray(r.municion) ? r.municion : []).forEach((t, j) => {
      if (typeof t === 'string') out.push([`chuleta[${i}].municion[${j}]`, t]);
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 1. Integridad y estructura. Una ficha sin campos, con tipos equivocados o con
//    valores fuera de rango rompe la app o la pinta vacía.
// ---------------------------------------------------------------------------
if (!Array.isArray(data)) { console.log('✗ obj-data no es una lista de fichas'); process.exit(1); }
if (typeof vars !== 'object' || Array.isArray(vars)) { console.log('✗ obj-vars no es un objeto'); process.exit(1); }

const vistos = new Set();
data.forEach((d, i) => {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return fallo(`ficha nº ${i + 1}: no es un objeto`);
  const id = d.id || `ficha nº ${i + 1}`;
  ['id', 'cat', 'catLabel', 'catColor', 'ongs', 'freq', 'diff', ...CAMPOS].forEach(c => {
    if (d[c] === undefined || d[c] === null || d[c] === '') fallo(`${id}: falta el campo ${c}`);
  });
  ['id', 'cat', 'catLabel', 'catColor', ...CAMPOS].forEach(c => {
    if (d[c] !== undefined && typeof d[c] !== 'string') fallo(`${id}: el campo ${c} no es texto`);
  });
  if (typeof d.id === 'string' && !/^[a-z0-9_]+$/.test(d.id)) fallo(`${id}: id con caracteres no permitidos (solo minúsculas, números y _)`);
  if (vistos.has(d.id)) fallo(`id duplicado: ${d.id}`);
  vistos.add(d.id);
  if (![1, 2, 3].includes(d.diff)) fallo(`${id}: dificultad inválida (${JSON.stringify(d.diff)})`);
  if (![1, 2, 3].includes(d.freq)) fallo(`${id}: frecuencia inválida (${JSON.stringify(d.freq)})`);
  Object.keys(d).forEach(k => {
    if (!['id', 'cat', 'catLabel', 'catColor', 'ongs', 'freq', 'diff', ...CAMPOS, ...OPCIONALES].includes(k))
      aviso(`${id}: campo desconocido "${k}" (la app lo ignora)`);
  });
  CAMPOS.forEach(c => {
    if (typeof d[c] !== 'string') return;
    if (d[c] !== d[c].trim()) aviso(`${id}.${c}: espacios al principio o al final`);
    if (/ {2,}/.test(d[c])) aviso(`${id}.${c}: espacios dobles`);
  });
  if (d.chuletaTerritorial !== undefined) {
    if (!Array.isArray(d.chuletaTerritorial)) fallo(`${id}: chuletaTerritorial no es una lista`);
    else d.chuletaTerritorial.forEach((r, j) => {
      if (typeof r.region !== 'string' || !r.region) fallo(`${id}: chuleta[${j}] sin región`);
      if (typeof r.texto !== 'string' || !r.texto) fallo(`${id}: chuleta[${j}] sin texto`);
      if (r.municion !== undefined && !Array.isArray(r.municion)) fallo(`${id}: chuleta[${j}].municion no es una lista`);
    });
  }
});

Object.entries(vars).forEach(([k, v]) => {
  if (!/^\{\{[^{}\s]+\}\}$/.test(k)) fallo(`variable con nombre mal formado: ${k}`);
  if (typeof v !== 'string' || !v.trim()) fallo(`variable sin valor: ${k}`);
});

// A partir de aquí se trabaja sobre una copia normalizada: si a una ficha le
// falta un campo, ya consta como error arriba y el resto de comprobaciones
// siguen en lugar de romperse.
const fichas = data
  .filter(d => typeof d === 'object' && d !== null && !Array.isArray(d))
  .map(d => ({
    ...d,
    ongs: Array.isArray(d.ongs) ? d.ongs.filter(o => typeof o === 'string') : [],
    ...Object.fromEntries(CAMPOS.map(c => [c, typeof d[c] === 'string' ? d[c] : '']))
  }));

// ---------------------------------------------------------------------------
// 2. ONG. El filtro de la app sale del array ONGS del código: una ficha con una
//    ONG que no está ahí no aparece en ningún filtro.
// ---------------------------------------------------------------------------
fichas.forEach(d => {
  if (!d.ongs.length) return fallo(`${d.id}: sin ONG asignada`);
  d.ongs.forEach(o => { if (!ONGS[o]) fallo(`${d.id}: la ONG "${o}" no existe en ONGS`); });
  if (new Set(d.ongs).size !== d.ongs.length) fallo(`${d.id}: ONG repetida en ongs`);
});

// ---------------------------------------------------------------------------
// 3. Categorías. El label y el color de cada ficha tienen que salir del array
//    CATS del código, o la sección se pinta con otro nombre o color.
// ---------------------------------------------------------------------------
fichas.forEach(d => {
  if (!CATS[d.cat]) return fallo(`${d.id}: la categoría "${d.cat}" no existe en CATS`);
  if (d.catLabel !== CATS[d.cat].label) fallo(`${d.id}: catLabel no coincide con CATS`);
  if (d.catColor !== CATS[d.cat].color) fallo(`${d.id}: catColor no coincide con CATS`);
});

// ---------------------------------------------------------------------------
// 4. Variables. Una variable sin declarar se renderiza como cadena vacía y la
//    frase se queda coja sin que nadie lo note.
// ---------------------------------------------------------------------------
// Variables que se conservan a propósito aunque ninguna ficha las use
// (formato: '{{nombre}}': 'motivo')
const RESERVADAS = {};
const usadas = new Set();
fichas.forEach(d => textos(d).forEach(([c, t]) => {
  [...t.matchAll(/\{\{([^}]+)\}\}/g)].forEach(m => usadas.add('{{' + m[1] + '}}'));
  if (render(t).includes(' ROTA ')) fallo(`${d.id}.${c}: usa una variable que no existe`);

  // Mal escritas: con espacios, con una sola llave o sin cerrar. La app no las
  // sustituye y el captador ve las llaves en pantalla.
  if (/\{\{\s+[^}]*\}\}|\{\{[^}]*\s+\}\}/.test(t)) fallo(`${d.id}.${c}: variable con espacios dentro de las llaves`);
  if (/(^|[^{])\{[a-z_]+\}(?!\})/.test(t)) fallo(`${d.id}.${c}: variable con una sola llave`);
  if ((t.match(/\{\{/g) || []).length !== (t.match(/\}\}/g) || []).length) fallo(`${d.id}.${c}: llaves de variable sin cerrar`);

  // Las cifras de una ONG solo se sustituyen por variables de esa misma ONG
  [...t.matchAll(/\{\{([a-z]+_)[^}]*\}\}/g)].forEach(m => {
    const dueña = Object.keys(PREFIJO).find(o => PREFIJO[o] === m[1]);
    if (dueña && !d.ongs.includes(dueña)) fallo(`${d.id}.${c}: usa ${m[0]}, que es una variable de ${dueña}`);
  });
}));
Object.keys(vars).forEach(v => {
  if (!usadas.has(v) && !RESERVADAS[v]) aviso(`variable declarada y sin usar: ${v}`);
});
Object.keys(RESERVADAS).forEach(v => {
  if (!(v in vars)) aviso(`${v} figura como reservada pero ya no está declarada`);
});
Object.keys(vars).forEach(v => {
  if (/[^\x00-\x7F]/.test(v.replace(/[{}]/g, ''))) aviso(`variable con acento o eñe en el nombre: ${v}`);
});

// ---------------------------------------------------------------------------
// 5. Desincronización. Si una ficha escribe a mano un valor que tiene variable,
//    al actualizar la variable esa ficha se queda con el dato viejo.
//    Le pasó a aecc13: mostraba 85% en el resumen y 82,8% en la respuesta.
// ---------------------------------------------------------------------------
fichas.forEach(d => {
  d.ongs.map(o => PREFIJO[o]).filter(Boolean).forEach(pref => {
    Object.keys(vars).filter(k => k.startsWith('{{' + pref)).forEach(k => {
      const val = String(vars[k]).trim();
      if (val.length < 4) return;
      textos(d).forEach(([c, t]) => {
        const sinVars = t.replace(/\{\{[^}]+\}\}/g, ' ');
        if (new RegExp('(^|[^\\d.,%\\u0000])' + esc(val) + '(?![\\d.,])').test(sinVars))
          fallo(`${d.id}.${c}: escribe "${val}" a mano en vez de usar ${k}`);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Formato. La app pinta el texto tal cual: el markdown sale literal en
//    pantalla y los guiones largos no se pronuncian.
// ---------------------------------------------------------------------------
fichas.forEach(d => textos(d).forEach(([c, t]) => {
  if (/\*\*|__|`/.test(t)) fallo(`${d.id}.${c}: markdown (**, __ o comillas de código) que saldría literal`);
  if (/\[[^\]]+\]\([^)]+\)/.test(t)) fallo(`${d.id}.${c}: enlace en formato markdown`);
  if (/^\s{0,3}#{1,6}\s/m.test(t)) fallo(`${d.id}.${c}: título en formato markdown`);
  if (/^\s*[*-]\s/m.test(t)) aviso(`${d.id}.${c}: línea que empieza como viñeta de lista`);
  if (/[—–]/.test(t)) fallo(`${d.id}.${c}: guion largo, no se pronuncia`);
  // Escapes explícitos: escribir las comillas curvas literales aquí acaba
  // convirtiéndolas en rectas y la comprobación marca falsos positivos
  if (/[‘’“”]/.test(t)) fallo(`${d.id}.${c}: comilla tipográfica`);
}));

// ---------------------------------------------------------------------------
// 7. Redacción (avisos). Criterios editoriales acordados en las revisiones; no
//    bloquean porque a veces hay un motivo para saltárselos.
// ---------------------------------------------------------------------------

// Apertura automática. "Entiendo que…" o "Entiendo la frustración…" introducen
// una concesión concreta y se mantienen; lo que se señala es la fórmula suelta.
fichas.forEach(d => ['a', 'short'].forEach(c => {
  if (/^(claro,?\s*)?(lo|te) entiendo\b|^entiendo\s*[.,]/i.test(d[c]))
    aviso(`${d.id}.${c}: abre con la fórmula "${d[c].match(/^[^.,:]*/)[0]}"`);
}));

// Dos fichas de la misma ONG no deben empezar igual: se nota al estudiarlas seguidas
Object.keys(PREFIJO).concat('General').forEach(ong => {
  const f = fichas.filter(d => ong === 'General' ? d.ongs[0] === 'General' : d.ongs.includes(ong));
  const ap = {};
  f.forEach(d => (ap[d.a.split(/[.,:?!]/)[0].trim().toLowerCase()] ||= []).push(d.id));
  Object.entries(ap).filter(([, v]) => v.length > 1)
    .forEach(([k, v]) => aviso(`${ong}: apertura repetida "${k}" en ${v.join(', ')}`));
});

// Tercera persona. La respuesta y el resumen hablan en nombre de la entidad
// ("hacemos", no "WWF hace"). La pregunta y el TIP pueden ir en tercera persona,
// y hay usos legítimos (listados de entidades, historia), así que solo avisa.
const SUJETO = {
  AECC: 'la AECC|la Asociación',
  CR: 'Cruz Roja',
  AI: 'Aldeas Infantiles SOS|Aldeas Infantiles|Aldeas',
  FEC: 'la FEC|la Fundación Española del Corazón|la Fundación',
  FJC: 'la Fundación Josep Carreras|la Fundación',
  FPM: 'la Fundación Pasqual Maragall|la Fundación',
  WWF: 'WWF España|WWF',
  General: 'la organización|esta organización|la entidad|esta entidad'
};
const VERBO = 'trabaja|tiene|hace|financia|destina|recibe|invierte|atiende|ofrece|apoya|gestiona|investiga|' +
  'ayuda|dedica|promueve|impulsa|publica|colabora|coordina|participa|defiende|lucha|cuenta|lleva|presentó|' +
  'consiguió|logró|se opone|se dedica|ha conseguido|ha logrado|ha invertido|ha financiado|ha ayudado|está|es';
fichas.forEach(d => d.ongs.forEach(o => {
  if (!SUJETO[o]) return;
  // Sin preposición delante: "la sede de la Fundación está…" o "en la FEC es…"
  // no hablan de la entidad como sujeto
  const re = new RegExp('(^|[^\\p{L}])(?<!(?:de|del|a|al|en|con|por|para|sobre|desde)\\s)(' + SUJETO[o] + ')\\s+(?:también\\s+|ya\\s+|no\\s+|sí\\s+)?(' + VERBO + ')(?![\\p{L}])', 'u');
  ['a', 'short'].forEach(c => {
    const m = d[c].match(re);
    if (m) aviso(`${d.id}.${c}: posible tercera persona "${m[2]} ${m[3]}" (debería ser primera persona plural)`);
  });
}));

// Referencias temporales. Un "actualmente" o un "este año" caducan sin que nadie
// lo note. "Hoy" y "este mes" solo se señalan si la frase lleva una cifra
// escrita a mano, porque sin cifra suelen ser conversación ("¿hoy te sigue
// importando?") y una cifra en variable ya se actualiza sola.
const TIEMPO_SIEMPRE = /\b(actualmente|en la actualidad|a día de hoy|hasta la fecha|este año|el año pasado|el próximo año|recientemente|últimamente)\b/i;
const TIEMPO_CON_CIFRA = /\b(hoy( en día)?|este mes)\b/i;
fichas.forEach(d => textos(d).forEach(([c, t]) => {
  t.split(/(?<=[.!?])\s+/).forEach(frase => {
    const m = frase.match(TIEMPO_SIEMPRE) ||
      (/\d/.test(frase.replace(/\{\{[^}]+\}\}/g, '')) && frase.match(TIEMPO_CON_CIFRA));
    if (m) aviso(`${d.id}.${c}: referencia temporal "${m[0]}", revisar que siga vigente`);
  });
}));

// ---------------------------------------------------------------------------
// 8. Datos retirados. Valores corregidos que no deben reaparecer al editar.
// ---------------------------------------------------------------------------
const RETIRADOS = [
  ['Pascual Maragall', 'se escribe Pasqual'],
  ['323.063', 'asistencias de la DANA a diciembre de 2024; al año fueron 490.000'],
  ['112 millones', 'recaudación de la DANA; la cifra final fue 115'],
  ['80 millones ya movilizados', 'el balance oficial dice 61,5 ejecutados'],
  ['6.019', 'era el acumulado hasta diciembre, no el despliegue del primer día'],
  ['520.850', 'donantes del REDMO con los dígitos cambiados; son 520.508'],
  ['979 millones', 'presupuesto viejo de Cruz Roja'],
  ['una de las dos primeras causas', 'el cáncer es la primera causa de muerte en España'],
  ['más de 70 años', 'la antigüedad caduca; usar la fecha de fundación'],
  ['más de 55 años', 'la antigüedad caduca; usar la fecha de fundación'],
  ['más de 35 años', 'la antigüedad caduca; usar la fecha de fundación'],
  ['más de 17 años', 'la antigüedad caduca; usar la fecha de fundación'],
  ['de 160 años', 'la antigüedad caduca; usar la fecha de fundación'],
  ['cancelar la domiciliación desde tu propio banco', 'devolver el recibo no da de baja al socio'],
  ['ir a tu banco y pedirlo en ventanilla', 'devolver el recibo no da de baja al socio']
];
fichas.forEach(d => textos(d).forEach(([c, t]) => {
  RETIRADOS.forEach(([txt, motivo]) => {
    if (render(t).includes(txt)) fallo(`${d.id}.${c}: reaparece "${txt}": ${motivo}`);
  });
}));

// ---------------------------------------------------------------------------
// 9. Migración de favoritos. Los favoritos se guardan por id: si se renombra
//    una ficha sin añadirla a la tabla, el captador pierde sus favoritos.
// ---------------------------------------------------------------------------
const mig = {};
(html.match(/var FAV_ID_MIGRACION = \{([\s\S]*?)\};/) || [, ''])[1]
  .replace(/(\w+):\s*'([^']+)'/g, (_, a, b) => { mig[a] = b; return ''; });
Object.entries(mig).forEach(([viejo, nuevo]) => {
  if (!vistos.has(nuevo)) fallo(`migración ${viejo} -> ${nuevo}: el destino no existe`);
  if (vistos.has(viejo)) fallo(`migración ${viejo}: ese id sigue vivo, la traducción pisaría un favorito real`);
});
fichas.filter(d => d.ongs[0] === 'General').forEach(d => {
  if (!/^gen/.test(d.id)) aviso(`${d.id}: ficha de General sin prefijo gen`);
});

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
const ongs = {};
fichas.forEach(d => (ongs[d.ongs[0]] = (ongs[d.ongs[0]] || 0) + 1));
const w = fichas.map(d => palabras(d.a));

console.log('rebatidapp · verificación\n');
console.log(`  ${data.length} fichas   ${Object.entries(ongs).map(([o, n]) => o + ' ' + n).join('  ')}`);
console.log(`  respuestas: ${Math.min(...w)}-${Math.max(...w)} palabras, media ${Math.round(w.reduce((a, b) => a + b, 0) / w.length)} (informativo, no es una regla)`);
console.log(`  ${Object.keys(vars).length} variables, ${usadas.size} en uso\n`);

if (avisos.length) {
  console.log(`AVISOS (${avisos.length}) · revisión humana, no bloquean`);
  avisos.forEach(a => console.log('  · ' + a));
  console.log('');
}
if (fallos.length) {
  console.log(`ERRORES (${fallos.length}) · bloquean`);
  fallos.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('Sin errores.');
