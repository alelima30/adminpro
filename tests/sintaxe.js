// Verifica se todo o JavaScript embutido no adminpro.html compila.
// Pega erros de digitação que só apareceriam com a tela em branco no navegador.
//
// Rodar:  node tests/sintaxe.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const alvos = ['adminpro.html', 'cadastro.html'];
let falhas = 0;

for (const arquivo of alvos) {
  const caminho = path.join(__dirname, '..', arquivo);
  if (!fs.existsSync(caminho)) { console.log('- ' + arquivo + ' (não existe, pulando)'); continue; }

  const html = fs.readFileSync(caminho, 'utf8');
  const blocos = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];

  let erro = null;
  blocos.forEach((bloco, i) => {
    const codigo = bloco.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    try { new vm.Script(codigo, { filename: arquivo + ' [bloco ' + (i + 1) + ']' }); }
    catch (e) { if (!erro) erro = e; }
  });

  if (erro) { falhas++; console.log('✗ ' + arquivo + ': ' + erro.message); }
  else console.log('✓ ' + arquivo + ' — ' + blocos.length + ' bloco(s) de script, sintaxe OK');
}

console.log('\n' + (falhas === 0 ? 'SINTAXE OK' : falhas + ' arquivo(s) com erro'));
process.exit(falhas === 0 ? 0 : 1);
