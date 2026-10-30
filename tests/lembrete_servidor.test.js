// Testes da funcao que roda NO SERVIDOR (supabase/functions/lembretes).
// Rodar:  node --experimental-strip-types tests/lembrete_servidor.test.js
//
// E ela quem manda o lembrete de 24h com o app fechado. As regras puras sao
// importadas do proprio arquivo que vai para o ar.

const fs = require('fs');
const path = require('path');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

const ARQ = path.join(__dirname, '..', 'supabase', 'functions', 'lembretes', 'index.ts');
const src = fs.readFileSync(ARQ, 'utf8');

/* O arquivo importa do Deno e chama serve() ao ser carregado, entao nao da
   para exigi-lo aqui. As duas regras puras sao lidas do proprio fonte e
   avaliadas -- continua sendo o codigo que vai para o ar, nao uma copia. */
function pegar(nome) {
  const m = src.match(new RegExp('export function ' + nome + '\\(([\\s\\S]*?)\\n\\}', 'm'));
  if (!m) throw new Error('nao achei ' + nome + ' no fonte');
  const corpo = ('function ' + nome + '(' + m[1] + '\n}')
    .replace(/:\s*number/g, '').replace(/:\s*string/g, '').replace(/:\s*boolean/g, '');
  return eval('(' + corpo + ')');
}
const janelaLembrete = pegar('janelaLembrete');
const quandoTexto = pegar('quandoTexto');

// ── A janela do aviso de 24h ──────────────────────────────────────────
bloco('Aviso de 24h: a janela nao pode ser estreita', () => {
  /* Relato: "nao esta chegando a mensagem de 24h antes".

     A regra antiga era  minAte entre 1420 e 1440  -- uma faixa de 20 minutos.
     O cron roda a cada 15 min, entao UMA passada que falhasse ou atrasasse
     dentro dessa faixa perdia o lembrete PARA SEMPRE: na passada seguinte
     minAte ja estava abaixo de 1420 e a reserva nunca mais era olhada. */
  checa('exatamente 24h antes: avisa', janelaLembrete(1440, '24h', 1440), true);
  checa('23h antes ainda avisa (a passada de 24h pode ter falhado)',
        janelaLembrete(1380, '24h', 1440), true);
  checa('e 3h antes tambem', janelaLembrete(180, '24h', 1440), true);

  // A faixa antiga rejeitava estes dois -- era esse o bug.
  checa('a regra antiga perderia os 23h', 1380 >= 1420 && 1380 <= 1440, false);

  checa('mais de 24h antes: ainda nao', janelaLembrete(1500, '24h', 1440), false);
  // Abaixo de 1 hora quem avisa e o lembrete de 1h: nao se manda os dois.
  checa('faltando 1 hora, o de 24h ja nao fala', janelaLembrete(60, '24h', 1440), false);
  checa('nem faltando 10 minutos', janelaLembrete(10, '24h', 1440), false);

  // O de 1 hora cobre do limite ate a hora de comecar.
  checa('1h antes: avisa', janelaLembrete(60, '1h', 60), true);
  checa('faltando 5 minutos ainda avisa', janelaLembrete(5, '1h', 60), true);
  checa('ja comecou: nao avisa', janelaLembrete(0, '1h', 60), false);
  checa('passou: nao avisa', janelaLembrete(-30, '1h', 60), false);
});

// ── O texto tem de bater com o dia ────────────────────────────────────
bloco('"amanha" so quando for amanha', () => {
  /* Com a janela larga, o aviso de 24h pode sair no mesmo dia da reserva
     (marcada em cima da hora, ou passada perdida mais cedo). Dizer "amanha"
     ali mandaria a pessoa no dia errado. */
  checa('reserva de amanha', quandoTexto('24h', '2026-11-01', '2026-10-31'), 'amanha');
  checa('reserva de hoje', quandoTexto('24h', '2026-10-31', '2026-10-31'), 'hoje');
  checa('o de 1 hora nao muda', quandoTexto('1h', '2026-10-31', '2026-10-31'), 'em 1 hora');
});

// ── Falha de envio nao pode virar silencio ────────────────────────────
bloco('Envio que falha nao conta como enviado', () => {
  /* enviar() engolia tudo: nao olhava a resposta e nao avisava o chamador.
     Numero recusado, modelo reprovado, segredo faltando -- tudo virava
     silencio, e a chave era gravada como "ja enviado" do mesmo jeito. A
     reserva nunca mais era tentada. */
  checa('enviar devolve se deu certo',
    /async function enviar\([\s\S]{0,400}Promise<\{ ok: boolean; erro\?: string \}>/.test(src), true);
  checa('e olha a resposta do provedor', /if \(r\.ok\) return \{ ok: true \};/.test(src), true);
  checa('nao sobrou o engolidor', /catch \(_\) \{ \/\* ignora falha individual \*\/ \}/.test(src), false);

  checa('so marca como enviado se alguem recebeu',
    /if \(!algumOk\) \{[\s\S]{0,400}continue;/.test(src), true);
  checa('e os motivos saem na resposta, para dar para conferir',
    /problemas,/.test(src) && /problemas\.push\(\{ reserva: r\.id, aviso: lead\.tag, falhas \}\)/.test(src), true);

  // A lista de chaves ja enviadas cresce para sempre; cortada pelo limite de
  // linhas da API, viraria lembrete repetido.
  checa('a leitura das chaves e limitada no tempo',
    /lembretes_enviados\?select=chave&criado_em=gte\.\$\{corte\}/.test(src), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
