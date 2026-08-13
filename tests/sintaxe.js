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

  if (erro) {
    falhas++;
    // console.ERROR, não console.log: quem roda com ">/dev/null" para tirar o
    // barulho continua vendo a falha. Foi assim que um erro de sintaxe passou
    // batido até o ar — o teste acusou, a saída estava escondida, e o "&&"
    // seguinte simplesmente não rodou. Silêncio parecia aprovação.
    console.error('✗ ' + arquivo + ': ' + erro.message);
  } else {
    console.log('✓ ' + arquivo + ' — ' + blocos.length + ' bloco(s) de script, sintaxe OK');
  }
}

// Erro que o parser só reporta longe de onde nasceu.
//
// Um fecha-comentário escrito no meio de uma frase encerra o comentário ali.
// O resto do texto vira código, e a mensagem do navegador aponta para uma
// palavra qualquer da frase ("Unexpected identifier 'dois'") a dezenas de
// linhas do verdadeiro culpado — no caso, um par de caminhos escrito junto,
// do tipo "disp_" e "fin_" separados por asterisco e barra.
//
// Como derruba o bloco de script inteiro (e com ele o login), vale um aviso
// que diga o NOME do problema, e não só o sintoma.
//
// Este comentário é de LINHA de propósito: descrever a armadilha dentro de
// um comentário de bloco cairia nela.
for (const arquivo of alvos) {
  const caminho = path.join(__dirname, '..', arquivo);
  if (!fs.existsSync(caminho)) continue;
  const linhas = fs.readFileSync(caminho, 'utf8').split('\n');
  let dentro = false;
  linhas.forEach((linha, i) => {
    let resto = linha;
    while (resto.length) {
      if (!dentro) {
        const a = resto.indexOf('/*');
        if (a < 0) break;
        dentro = true; resto = resto.slice(a + 2);
      } else {
        const f = resto.indexOf('*/');
        if (f < 0) break;
        // Fechamento colado em texto (ex.: "disp_*/fin_") quase sempre é acidente.
        const depois = resto.slice(f + 2);
        if (/^[A-Za-z0-9_]/.test(depois)) {
          falhas++;
          console.error('✗ ' + arquivo + ':' + (i + 1) +
            ' — o "*/" fecha o comentário no meio da frase. Reescreva sem "*/".\n      ' +
            linha.trim().slice(0, 100));
        }
        dentro = false; resto = depois;
      }
    }
  });
}

const fim = falhas === 0 ? 'SINTAXE OK' : falhas + ' problema(s) de sintaxe';
(falhas === 0 ? console.log : console.error)('\n' + fim);
process.exit(falhas === 0 ? 0 : 1);
