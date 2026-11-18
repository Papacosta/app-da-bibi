import { api, MODO_DEMO, traduzirErro, CONFIG_PADRAO } from './api.js';

// =================================================================
// Utilidades
// =================================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => Number(v) || 0;
const brl = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dec = (v, c = 1) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: c });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const paraData = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const hojeIso = () => iso(new Date());
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const nomeMes = (d) => { const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const dataCurta = (s) => paraData(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dataLonga = (s) => paraData(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const horas = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`; };
const mesDe = (s) => s.slice(0, 7);
const CATEGORIAS = { manutencao: 'Manutenção', combustivel_extra: 'Combustível (extra)', estacionamento: 'Estacionamento / pedágio', limpeza: 'Lavagem / limpeza', outros: 'Outros' };

// =================================================================
// Estado
// =================================================================
const estado = {
  perfil: null, admin: false, aba: 'dias',
  mes: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  periodo: 'mes',
  dados: { dias: [], pagamentos: [], gastos: [], custos: {}, config: null },
};
const cfg = () => estado.dados.config || CONFIG_PADRAO;
const mapaDias = () => Object.fromEntries(estado.dados.dias.map((d) => [d.data, d]));
const custoCombustivel = (km, c = cfg()) => (num(c.consumo_km_l) > 0 ? num(km) / num(c.consumo_km_l) * num(c.preco_combustivel) : 0);
const ehPrevisto = (s) => estado.admin && cfg().dias_semana.includes(paraData(s).getDay());

// =================================================================
// Situação dos dados e avisos (heurística 1: visibilidade do status)
// =================================================================
function sync(tipo) {
  const el = $('#sync');
  el.className = 'sync ' + (tipo || '');
  el.textContent = tipo === 'salvando' ? '● Salvando…' : tipo === 'erro' ? '● Não salvo' : '● Salvo';
}
function avisar(texto, { erro = false, desfazer = null, tempo = 6000 } = {}) {
  const el = document.createElement('div');
  el.className = 'aviso-toast' + (erro ? ' erro' : '');
  el.setAttribute('role', erro ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(texto)}</span>`;
  if (desfazer) {
    const b = document.createElement('button');
    b.textContent = 'Desfazer';
    b.onclick = () => { el.remove(); desfazer(); };
    el.append(b);
  }
  $('#avisos').append(el);
  setTimeout(() => el.remove(), erro ? 9000 : tempo);
}

// Executa uma alteração mostrando "Salvando…", tratando erros e recarregando.
async function executar(acao, sucesso, desfazer) {
  sync('salvando');
  try {
    await acao();
    await recarregar();
    sync();
    if (sucesso) avisar(sucesso, { desfazer });
    return true;
  } catch (e) {
    sync('erro');
    avisar(traduzirErro(e), { erro: true });
    render();
    return false;
  }
}

async function recarregar() {
  estado.dados = await api.carregarTudo(estado.admin);
  render();
}

// =================================================================
// Login
// =================================================================
async function iniciar() {
  if (MODO_DEMO) { $('#aviso-demo').hidden = false; $('#faixa-demo').hidden = false; }
  try {
    const usuario = await api.sessao();
    if (usuario) await entrarNoApp(); else mostrarLogin();
  } catch (e) {
    mostrarLogin(traduzirErro(e));
  }
}

function mostrarLogin(erro) {
  $('#carregando').hidden = true;
  $('#app').hidden = true;
  $('#tela-login').hidden = false;
  const el = $('#erro-login');
  el.hidden = !erro; el.textContent = erro || '';
  $('#login-email').focus();
}

async function entrarNoApp() {
  const perfil = await api.perfil();
  if (!perfil) return mostrarLogin();
  if (perfil.papel === 'pendente') {
    await api.sair();
    return mostrarLogin('Seu usuário ainda não foi liberado. Peça ao admin para definir seu papel no Supabase.');
  }
  estado.perfil = perfil;
  estado.admin = perfil.papel === 'admin';
  $('#quem').textContent = `${perfil.nome || perfil.email} · ${estado.admin ? 'admin' : 'responsável'}`;
  $$('[data-admin]').forEach((el) => { el.hidden = !estado.admin; });
  $('#tela-login').hidden = true;
  $('#carregando').hidden = false;
  await recarregar();
  $('#carregando').hidden = true;
  $('#app').hidden = false;
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('#login-email').value.trim();
  const senha = $('#login-senha').value;
  const erro = $('#erro-login');
  if (!email || !senha) {
    erro.hidden = false; erro.textContent = 'Preencha o e-mail e a senha.';
    (email ? $('#login-senha') : $('#login-email')).focus();
    return;
  }
  const botao = ev.submitter || $('#form-login button[type=submit]');
  botao.disabled = true; botao.textContent = 'Entrando…';
  try {
    await api.entrar(email, senha);
    await entrarNoApp();
  } catch (e) {
    erro.hidden = false; erro.textContent = traduzirErro(e);
  } finally {
    botao.disabled = false; botao.textContent = 'Entrar';
  }
});
$('#ver-senha').addEventListener('click', (ev) => {
  const i = $('#login-senha'); const mostrar = i.type === 'password';
  i.type = mostrar ? 'text' : 'password';
  ev.currentTarget.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
});
$$('[data-demo]').forEach((b) => b.addEventListener('click', () => {
  $('#login-email').value = b.dataset.demo; $('#login-senha').value = 'demo';
  $('#form-login').requestSubmit();
}));
$('#sair').addEventListener('click', async () => { await api.sair(); location.reload(); });
$('#reiniciar-demo')?.addEventListener('click', async () => { api.reiniciarDemo?.(); await api.entrar(estado.perfil.email); await recarregar(); avisar('Exemplo recomeçado.'); });

// =================================================================
// Navegação
// =================================================================
function irPara(aba) {
  estado.aba = aba;
  $$('.abas button').forEach((b) => {
    const ativa = b.dataset.aba === aba;
    b.classList.toggle('ativa', ativa);
    if (ativa) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  $('#conteudo').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}
$$('.abas button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));
$$('[data-ir]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.ir)));

function render() {
  const telas = { dias: telaDias, pagamentos: telaPagamentos, gastos: telaGastos, resumo: telaResumo, ajustes: telaAjustes, ajuda: telaAjuda };
  const tela = (!estado.admin && ['gastos', 'resumo', 'ajustes'].includes(estado.aba)) ? telaDias : telas[estado.aba];
  $('#conteudo').innerHTML = tela();
  ligarEventos();
}

function navMes() {
  return `<div class="mes-nav">
    <button class="botao-icone" data-mes="-1" aria-label="Mês anterior" title="Mês anterior">‹</button>
    <h2>${esc(nomeMes(estado.mes))}</h2>
    <button class="botao-icone" data-mes="1" aria-label="Próximo mês" title="Próximo mês">›</button>
    ${iso(estado.mes).slice(0, 7) !== hojeIso().slice(0, 7) ? '<button class="botao pequeno" data-mes="0">Mês atual</button>' : ''}
  </div>`;
}

// =================================================================
// Tela: Dias
// =================================================================
function diasPendentes() {
  if (!estado.admin) return [];
  const mapa = mapaDias();
  const primeiro = estado.dados.dias[0]?.data;
  const agora = new Date();
  const inicio = primeiro ? paraData(primeiro) : new Date(agora.getFullYear(), agora.getMonth(), 1);
  const lista = [];
  for (let d = new Date(inicio); iso(d) < hojeIso(); d.setDate(d.getDate() + 1)) {
    const s = iso(d);
    if (ehPrevisto(s) && !mapa[s]) lista.push(s);
  }
  return lista;
}

function totaisDe(dias) {
  const levei = dias.filter((d) => d.status === 'levei');
  return {
    dias: levei.length,
    percursos: levei.reduce((t, d) => t + num(d.percursos), 0),
    km: levei.reduce((t, d) => t + num(d.km), 0),
    minutos: levei.reduce((t, d) => t + num(d.minutos), 0),
    valor: levei.reduce((t, d) => t + num(d.valor), 0),
    combustivel: levei.reduce((t, d) => t + num(estado.dados.custos[d.id]), 0),
  };
}

function telaDias() {
  const mapa = mapaDias();
  const hoje = hojeIso();
  const partes = [];

  if (estado.admin) {
    const reg = mapa[hoje];
    const sem = SEMANA_LONGA[new Date().getDay()];
    if (reg) {
      partes.push(`<section class="cartao hoje feito">
        <h2>Hoje, ${sem}</h2>
        <p>${reg.status === 'levei'
          ? `✅ Registrado: você levou a Bibi — ${reg.percursos} percurso(s), ${brl(reg.valor)}.`
          : '➖ Registrado: hoje você não levou.'}</p>
        <button class="botao" data-abrir-dia="${hoje}">Ver ou corrigir</button>
      </section>`);
    } else {
      partes.push(`<section class="cartao hoje">
        <h2>Hoje, ${sem}</h2>
        <p>${ehPrevisto(hoje) ? 'Hoje é dia de aula. Você levou a Bibi?' : 'Hoje não é dia de aula normal. Levou mesmo assim?'}</p>
        <div class="botoes">
          <button class="botao ok" data-rapido="${hoje}" data-status="levei">✓ Levei hoje (${cfg().percursos_por_dia} percursos)</button>
          <button class="botao" data-abrir-dia="${hoje}">Outro valor…</button>
          ${ehPrevisto(hoje) ? `<button class="botao" data-rapido="${hoje}" data-status="nao_levei">Não levei</button>` : ''}
        </div>
      </section>`);
    }

    const pend = diasPendentes();
    if (pend.length) {
      partes.push(`<section class="cartao">
        <div class="linha"><h3>⚠️ ${pend.length} dia(s) de aula sem registro</h3>
          ${pend.length > 1 ? '<button class="botao pequeno" id="todos-levei">Marcar todos como “levei”</button>' : ''}</div>
        <p class="sutil">Confirme para não esquecer nenhum dia na hora de cobrar.</p>
        <div>${pend.slice(-10).reverse().map((s) => `<div class="pendente-item">
          <span>${esc(dataLonga(s))}</span>
          <span class="botoes" style="flex:0 0 auto">
            <button class="botao pequeno ok" data-rapido="${s}" data-status="levei">Levei</button>
            <button class="botao pequeno" data-rapido="${s}" data-status="nao_levei">Não levei</button>
          </span></div>`).join('')}
        ${pend.length > 10 ? `<p class="sutil">Mostrando os 10 mais recentes de ${pend.length}.</p>` : ''}</div>
      </section>`);
    }
  }

  // Calendário do mês
  const ano = estado.mes.getFullYear(), mes = estado.mes.getMonth();
  const inicioSem = new Date(ano, mes, 1).getDay();
  const qtd = new Date(ano, mes + 1, 0).getDate();
  const celulas = [];
  for (let i = 0; i < inicioSem; i++) celulas.push('<span class="dia vazio"></span>');
  for (let n = 1; n <= qtd; n++) {
    const s = iso(new Date(ano, mes, n));
    const reg = mapa[s];
    const previsto = ehPrevisto(s);
    let cls = 'dia', rotulo = `${n} de ${nomeMes(estado.mes)}`, extra = '';
    if (reg?.status === 'levei') { cls += ' levei'; rotulo += ', levei'; extra = '<small>✓</small>'; if (estado.admin && !previsto) cls += ' extra'; }
    else if (reg?.status === 'nao_levei') { cls += ' nao_levei'; rotulo += ', não levei'; }
    else if (previsto && s < hoje) { cls += ' pendente'; rotulo += ', sem registro'; extra = '<small>?</small>'; }
    else if (previsto) { cls += ' previsto'; rotulo += ', dia de aula'; }
    if (s === hoje) { cls += ' hoje-cal'; rotulo += ' (hoje)'; }
    const clicavel = estado.admin || reg;
    celulas.push(`<button class="${cls}" ${clicavel ? `data-abrir-dia="${s}"` : 'disabled'} aria-label="${esc(rotulo)}">${n}${extra}</button>`);
  }
  const doMes = estado.dados.dias.filter((d) => mesDe(d.data) === iso(estado.mes).slice(0, 7));
  const t = totaisDe(doMes);

  partes.push(`<section class="cartao">
    <div class="linha">${navMes()}</div>
    <div class="calendario" style="margin-top:.75rem">
      ${SEMANA.map((d) => `<span class="semana">${d}</span>`).join('')}
      ${celulas.join('')}
    </div>
    <div class="legenda">
      <span><i style="background:var(--ok-suave);border:1px solid var(--ok)"></i>Levei</span>
      <span><i style="background:var(--neutro-suave)"></i>Não levei</span>
      ${estado.admin ? `<span><i style="background:var(--alerta-suave);border:1px dashed var(--alerta)"></i>Sem registro</span>
      <span><i style="border:1px dashed var(--sutil)"></i>Dia de aula</span>
      <span><i style="background:var(--primaria);border-radius:50%;width:8px;height:8px"></i>Dia extra</span>` : ''}
    </div>
  </section>`);

  partes.push(`<section class="cartao">
    <div class="linha"><h3>Total de ${esc(nomeMes(estado.mes))}</h3>
      <button class="botao pequeno" id="copiar-mes" ${t.dias ? '' : 'disabled'}>📋 Copiar resumo</button></div>
    <div class="numeros">
      <div class="numero-cartao"><span>${estado.admin ? 'Dias que levei' : 'Dias com transporte'}</span><strong>${t.dias}</strong></div>
      <div class="numero-cartao"><span>Percursos</span><strong>${t.percursos}</strong></div>
      <div class="numero-cartao destaque"><span>Valor do mês</span><strong>${brl(t.valor)}</strong></div>
    </div>
    ${listaDias(doMes)}
  </section>`);

  if (!estado.admin) partes.push(cartaoSaldo());
  return partes.join('');
}

function listaDias(dias) {
  if (!dias.length) return '<p class="vazio-msg">Nenhum dia registrado neste mês.</p>';
  return `<ul class="lista" style="margin-top:.75rem">${[...dias].reverse().map((d) => `<li>
    <div class="info"><strong>${esc(dataLonga(d.data))}</strong>
      <small>${d.status === 'levei' ? `${d.percursos} percurso(s) · ${dec(d.km)} km · ${horas(d.minutos)}` : 'Não levou'}${d.observacao ? ' · ' + esc(d.observacao) : ''}</small></div>
    <span class="valor">${d.status === 'levei' ? brl(d.valor) : '<span class="etiqueta">não levei</span>'}</span>
    ${estado.admin ? `<button class="botao pequeno fantasma" data-abrir-dia="${d.data}" aria-label="Editar ${esc(dataCurta(d.data))}">Editar</button>` : ''}
  </li>`).join('')}</ul>`;
}

// ---------- Registro rápido e diálogo do dia ----------
function diaPadrao(data, status) {
  const c = cfg();
  const p = status === 'levei' ? num(c.percursos_por_dia) : 0;
  return { data, status, percursos: p, km: p * num(c.km_percurso), minutos: p * num(c.minutos_percurso), valor: p * num(c.valor_percurso), observacao: '' };
}

async function registroRapido(data, status) {
  if (status === 'levei' && data > hojeIso()) return avisar('Esse dia ainda não chegou. Registre depois da aula.', { erro: true });
  const dia = diaPadrao(data, status);
  let criado;
  await executar(async () => { criado = await api.salvarDia(dia, custoCombustivel(dia.km)); },
    `${dataCurta(data)}: ${status === 'levei' ? 'levei' : 'não levei'} — salvo.`,
    () => executar(() => api.excluirDia(criado.id), 'Registro desfeito.'));
}

function abrirDia(data) {
  const reg = mapaDias()[data];
  if (!estado.admin) return verDia(reg);
  const d = reg ? { ...reg } : diaPadrao(data, 'levei');
  const c = cfg();
  // campos que foram ajustados à mão não são recalculados ao mudar os percursos
  const base = { km: c.km_percurso, minutos: c.minutos_percurso, valor: c.valor_percurso };
  const tocado = new Set(reg ? Object.keys(base).filter((k) => Math.abs(num(reg[k]) - num(reg.percursos) * num(base[k])) > 0.01) : []);
  abrirDialogo(`
    <div class="dialogo-topo"><h2 id="dialogo-titulo">${esc(dataLonga(data))}</h2>
      <button type="button" class="botao-icone" data-fechar aria-label="Fechar">✕</button></div>
    ${!reg && data > hojeIso() ? '<p class="aviso">Esse dia ainda não chegou. Você só poderá marcar “Levei” depois da aula.</p>' : ''}
    <fieldset class="segmentado" style="border:0;padding:0;margin:0">
      <legend class="sutil" style="margin-bottom:.3rem">Você levou a Bibi neste dia?</legend>
      <label><input type="radio" name="status" value="levei" ${d.status === 'levei' ? 'checked' : ''}><span>✓ Levei</span></label>
      <label><input type="radio" name="status" value="nao_levei" ${d.status === 'nao_levei' ? 'checked' : ''}><span>Não levei</span></label>
    </fieldset>
    <div id="campos-levei" class="grade-form">
      <label>Quantos percursos?
        <span class="ajuda-campo">Ida e volta = 2. Só ida ou só volta = 1.</span>
        <span class="passo">
          <button type="button" class="botao-icone" data-passo="-1" aria-label="Menos um percurso">−</button>
          <input name="percursos" type="number" min="1" max="10" inputmode="numeric" value="${d.percursos || c.percursos_por_dia}">
          <button type="button" class="botao-icone" data-passo="1" aria-label="Mais um percurso">+</button>
        </span></label>
      <div class="duas-col">
        <label>Km rodados <input name="km" type="number" min="0" step="0.1" inputmode="decimal" value="${num(d.km)}"></label>
        <label>Tempo (minutos) <input name="minutos" type="number" min="0" step="1" inputmode="numeric" value="${num(d.minutos)}"></label>
      </div>
      <label>Valor a receber (R$)
        <span class="ajuda-campo">Calculado: percursos × ${brl(c.valor_percurso)}. Pode ajustar.</span>
        <input name="valor" type="number" min="0" step="0.01" inputmode="decimal" value="${num(d.valor)}"></label>
      <p class="previa" id="previa" aria-live="polite"></p>
    </div>
    <label>Observação <span class="ajuda-campo">Opcional. Ex.: aula extra, trânsito, a tia buscou na volta.</span>
      <input name="observacao" maxlength="200" value="${esc(d.observacao)}"></label>
    <p class="erro" id="erro-dialogo" role="alert" hidden></p>
    <div class="dialogo-acoes">
      ${reg ? '<button type="button" class="botao perigo esquerda" id="excluir-dia">Excluir registro</button>' : ''}
      <button type="button" class="botao" data-fechar>Cancelar</button>
      <button type="submit" class="botao primario">Salvar</button>
    </div>`, async (f) => {
    const status = f.status.value;
    const novo = {
      ...(reg ? { id: reg.id } : {}), data, status,
      percursos: status === 'levei' ? Math.round(num(f.percursos.value)) : 0,
      km: status === 'levei' ? num(f.km.value) : 0,
      minutos: status === 'levei' ? Math.round(num(f.minutos.value)) : 0,
      valor: status === 'levei' ? num(f.valor.value) : 0,
      observacao: f.observacao.value.trim(),
    };
    if (status === 'levei' && data > hojeIso()) return 'Esse dia ainda não chegou. Registre “Levei” depois da aula.';
    if (status === 'levei' && (novo.percursos < 1 || novo.percursos > 10)) return 'Informe de 1 a 10 percursos.';
    if (novo.km < 0 || novo.minutos < 0 || novo.valor < 0) return 'Os valores não podem ser negativos.';
    // mantém o custo de combustível já salvo se km não mudou (preço antigo)
    const custoAntigo = reg && num(reg.km) === novo.km ? estado.dados.custos[reg.id] : undefined;
    const custo = custoAntigo ?? custoCombustivel(novo.km);
    const ok = await executar(() => api.salvarDia(novo, custo), `${dataCurta(data)} salvo.`);
    return ok ? null : 'Não foi possível salvar. Veja o aviso abaixo.';
  });

  const f = $('#dialogo-form');
  const atualizar = () => {
    const levei = f.status.value === 'levei';
    $('#campos-levei').hidden = !levei;
    const p = num(f.percursos.value);
    if (!tocado.has('km')) f.km.value = +(p * num(c.km_percurso)).toFixed(1);
    if (!tocado.has('minutos')) f.minutos.value = p * num(c.minutos_percurso);
    if (!tocado.has('valor')) f.valor.value = +(p * num(c.valor_percurso)).toFixed(2);
    const custo = custoCombustivel(f.km.value);
    $('#previa').innerHTML = `Combustível estimado: <strong>${brl(custo)}</strong> · Sobra do dia: <strong>${brl(num(f.valor.value) - custo)}</strong>`;
  };
  f.addEventListener('input', (ev) => { if (['km', 'minutos', 'valor'].includes(ev.target.name)) tocado.add(ev.target.name); atualizar(); });
  $$('[data-passo]', f).forEach((b) => b.addEventListener('click', () => {
    f.percursos.value = Math.min(10, Math.max(1, num(f.percursos.value) + num(b.dataset.passo)));
    atualizar();
  }));
  $('#excluir-dia')?.addEventListener('click', async () => {
    fecharDialogo();
    const copia = { ...reg }; const custo = estado.dados.custos[reg.id] ?? 0;
    await executar(() => api.excluirDia(reg.id), `Registro de ${dataCurta(data)} excluído.`,
      () => executar(() => api.salvarDia(copia, custo), 'Registro restaurado.'));
  });
  atualizar();
}

function verDia(reg) {
  if (!reg) return;
  abrirDialogo(`
    <div class="dialogo-topo"><h2 id="dialogo-titulo">${esc(dataLonga(reg.data))}</h2>
      <button type="button" class="botao-icone" data-fechar aria-label="Fechar">✕</button></div>
    ${reg.status === 'levei' ? `<div class="numeros">
      <div class="numero-cartao"><span>Percursos</span><strong>${reg.percursos}</strong></div>
      <div class="numero-cartao"><span>Km</span><strong>${dec(reg.km)}</strong></div>
      <div class="numero-cartao"><span>Tempo</span><strong>${horas(reg.minutos)}</strong></div>
      <div class="numero-cartao destaque"><span>Valor</span><strong>${brl(reg.valor)}</strong></div></div>`
      : '<p>Neste dia a Bibi não foi levada.</p>'}
    ${reg.observacao ? `<p><strong>Observação:</strong> ${esc(reg.observacao)}</p>` : ''}
    <div class="dialogo-acoes"><button type="button" class="botao primario" data-fechar>Fechar</button></div>`);
}

function textoResumoMes() {
  const doMes = estado.dados.dias.filter((d) => mesDe(d.data) === iso(estado.mes).slice(0, 7) && d.status === 'levei');
  const t = totaisDe(doMes);
  const linhas = doMes.map((d) => `• ${dataCurta(d.data)} (${SEMANA[paraData(d.data).getDay()]}) — ${d.percursos} percurso(s) — ${brl(d.valor)}`);
  return `App da Bibi — ${nomeMes(estado.mes)}\n${linhas.join('\n')}\n\nTotal: ${t.dias} dias, ${t.percursos} percursos = ${brl(t.valor)}`;
}

// =================================================================
// Tela: Pagamentos
// =================================================================
function saldo() {
  const devido = totaisDe(estado.dados.dias).valor;
  const pago = estado.dados.pagamentos.reduce((t, p) => t + num(p.valor), 0);
  return { devido, pago, falta: devido - pago };
}

function cartaoSaldo() {
  const s = saldo();
  const msg = Math.abs(s.falta) < 0.005 ? 'Tudo pago ✓' : s.falta > 0 ? `Falta pagar ${brl(s.falta)}` : `Crédito de ${brl(-s.falta)} (pago a mais)`;
  return `<section class="cartao">
    <h3>Saldo geral</h3>
    <div class="numeros">
      <div class="numero-cartao"><span>Total dos dias</span><strong>${brl(s.devido)}</strong></div>
      <div class="numero-cartao"><span>Total pago</span><strong>${brl(s.pago)}</strong></div>
      <div class="numero-cartao destaque ${s.falta > 0.005 ? 'negativo' : 'positivo'}"><span>Situação</span><strong style="font-size:1.05rem">${msg}</strong></div>
    </div>
  </section>`;
}

function telaPagamentos() {
  const meses = {};
  for (const d of estado.dados.dias) if (d.status === 'levei') meses[mesDe(d.data)] = (meses[mesDe(d.data)] || 0) + num(d.valor);
  const chaves = Object.keys(meses).sort().reverse().slice(0, 6);
  return `
    ${cartaoSaldo()}
    <section class="cartao">
      <div class="linha"><h3>Pagamentos recebidos</h3>
        ${estado.admin ? '<button class="botao primario" id="novo-pagamento">+ Registrar pagamento</button>' : ''}</div>
      ${estado.dados.pagamentos.length ? `<ul class="lista">${estado.dados.pagamentos.map((p) => `<li>
        <div class="info"><strong>${esc(paraData(p.data).toLocaleDateString('pt-BR'))}</strong>${p.observacao ? `<small>${esc(p.observacao)}</small>` : ''}</div>
        <span class="valor">${brl(p.valor)}</span>
        ${estado.admin ? `<button class="botao pequeno fantasma" data-pagamento="${p.id}">Editar</button>` : ''}
      </li>`).join('')}</ul>` : '<p class="vazio-msg">Nenhum pagamento registrado ainda.</p>'}
    </section>
    <section class="cartao">
      <h3>Valor dos dias por mês</h3>
      ${chaves.length ? `<ul class="lista">${chaves.map((k) => `<li><div class="info">${esc(nomeMes(paraData(k + '-01')))}</div><span class="valor">${brl(meses[k])}</span></li>`).join('')}</ul>`
        : '<p class="vazio-msg">Ainda não há dias registrados.</p>'}
    </section>`;
}

function abrirPagamento(id) {
  const p = estado.dados.pagamentos.find((x) => x.id === id);
  const s = saldo();
  abrirDialogo(`
    <div class="dialogo-topo"><h2 id="dialogo-titulo">${p ? 'Editar pagamento' : 'Registrar pagamento'}</h2>
      <button type="button" class="botao-icone" data-fechar aria-label="Fechar">✕</button></div>
    <label>Data <input name="data" type="date" required max="${hojeIso()}" value="${p?.data || hojeIso()}"></label>
    <label>Valor (R$) ${!p && s.falta > 0 ? `<span class="ajuda-campo">Saldo em aberto: ${brl(s.falta)}</span>` : ''}
      <input name="valor" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${p ? num(p.valor) : (s.falta > 0 ? s.falta.toFixed(2) : '')}"></label>
    <label>Observação <span class="ajuda-campo">Opcional. Ex.: Pix, dinheiro, referente a outubro.</span>
      <input name="observacao" maxlength="200" value="${esc(p?.observacao || '')}"></label>
    <p class="erro" id="erro-dialogo" role="alert" hidden></p>
    <div class="dialogo-acoes">
      ${p ? '<button type="button" class="botao perigo esquerda" id="excluir-item">Excluir</button>' : ''}
      <button type="button" class="botao" data-fechar>Cancelar</button>
      <button type="submit" class="botao primario">Salvar</button>
    </div>`, async (f) => {
    const linha = { ...(p ? { id: p.id } : {}), data: f.data.value, valor: num(f.valor.value), observacao: f.observacao.value.trim() };
    if (!linha.data) return 'Informe a data do pagamento.';
    if (linha.data > hojeIso()) return 'A data não pode ser no futuro.';
    if (linha.valor <= 0) return 'Informe um valor maior que zero.';
    return (await executar(() => api.salvar('pagamentos', linha), `Pagamento de ${brl(linha.valor)} salvo.`)) ? null : 'Não foi possível salvar.';
  });
  ligarExcluir('pagamentos', p, `Pagamento de ${p && brl(p.valor)} excluído.`);
}

function ligarExcluir(tabela, item, msg) {
  $('#excluir-item')?.addEventListener('click', async () => {
    fecharDialogo();
    const copia = { ...item };
    await executar(() => api.excluir(tabela, item.id), msg, () => executar(() => api.salvar(tabela, copia), 'Restaurado.'));
  });
}

// =================================================================
// Tela: Gastos (admin)
// =================================================================
function telaGastos() {
  const chave = iso(estado.mes).slice(0, 7);
  const doMes = estado.dados.gastos.filter((g) => mesDe(g.data) === chave);
  const total = doMes.reduce((t, g) => t + num(g.valor), 0);
  const comb = totaisDe(estado.dados.dias.filter((d) => mesDe(d.data) === chave)).combustivel;
  return `
    <section class="cartao">
      <div class="linha">${navMes()}<button class="botao primario" id="novo-gasto">+ Adicionar gasto</button></div>
      <p class="sutil" style="margin-top:.75rem">ℹ️ O combustível de cada percurso já é calculado sozinho pelos km. Aqui entram os outros gastos com o carro: manutenção, lavagem, estacionamento…</p>
      <div class="numeros">
        <div class="numero-cartao"><span>Combustível (automático)</span><strong>${brl(comb)}</strong></div>
        <div class="numero-cartao"><span>Outros gastos</span><strong>${brl(total)}</strong></div>
        <div class="numero-cartao destaque"><span>Total do mês</span><strong>${brl(total + comb)}</strong></div>
      </div>
      ${doMes.length ? `<ul class="lista" style="margin-top:.75rem">${doMes.map((g) => `<li>
        <div class="info"><strong>${esc(g.descricao || CATEGORIAS[g.categoria])}</strong>
          <small>${esc(dataCurta(g.data))} · ${esc(CATEGORIAS[g.categoria] || g.categoria)}</small></div>
        <span class="valor">${brl(g.valor)}</span>
        <button class="botao pequeno fantasma" data-gasto="${g.id}">Editar</button></li>`).join('')}</ul>`
        : '<p class="vazio-msg">Nenhum gasto extra neste mês.</p>'}
    </section>`;
}

function abrirGasto(id) {
  const g = estado.dados.gastos.find((x) => x.id === id);
  const padraoData = iso(estado.mes).slice(0, 7) === hojeIso().slice(0, 7) ? hojeIso() : iso(estado.mes);
  abrirDialogo(`
    <div class="dialogo-topo"><h2 id="dialogo-titulo">${g ? 'Editar gasto' : 'Novo gasto'}</h2>
      <button type="button" class="botao-icone" data-fechar aria-label="Fechar">✕</button></div>
    <div class="duas-col">
      <label>Data <input name="data" type="date" required max="${hojeIso()}" value="${g?.data || padraoData}"></label>
      <label>Categoria <select name="categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}" ${g?.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <label>Descrição <span class="ajuda-campo">Ex.: troca de óleo, pneu, lavagem.</span>
      <input name="descricao" maxlength="120" value="${esc(g?.descricao || '')}"></label>
    <label>Valor (R$) <input name="valor" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${g ? num(g.valor) : ''}"></label>
    <p class="erro" id="erro-dialogo" role="alert" hidden></p>
    <div class="dialogo-acoes">
      ${g ? '<button type="button" class="botao perigo esquerda" id="excluir-item">Excluir</button>' : ''}
      <button type="button" class="botao" data-fechar>Cancelar</button>
      <button type="submit" class="botao primario">Salvar</button>
    </div>`, async (f) => {
    const linha = { ...(g ? { id: g.id } : {}), data: f.data.value, categoria: f.categoria.value, descricao: f.descricao.value.trim(), valor: num(f.valor.value) };
    if (!linha.data) return 'Informe a data do gasto.';
    if (linha.data > hojeIso()) return 'A data não pode ser no futuro.';
    if (linha.valor <= 0) return 'Informe um valor maior que zero.';
    return (await executar(() => api.salvar('gastos', linha), `Gasto de ${brl(linha.valor)} salvo.`)) ? null : 'Não foi possível salvar.';
  });
  ligarExcluir('gastos', g, 'Gasto excluído.');
}

// =================================================================
// Tela: Resumo (admin) — está dando lucro?
// =================================================================
function telaResumo() {
  const chaveMes = iso(estado.mes).slice(0, 7);
  const ano = String(estado.mes.getFullYear());
  const filtro = { mes: (s) => mesDe(s) === chaveMes, ano: (s) => s.startsWith(ano), tudo: () => true }[estado.periodo];
  const t = totaisDe(estado.dados.dias.filter((d) => filtro(d.data)));
  const gastos = estado.dados.gastos.filter((g) => filtro(g.data)).reduce((s, g) => s + num(g.valor), 0);
  const custo = t.combustivel + gastos;
  const lucro = t.valor - custo;
  const h = t.minutos / 60;

  // últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(estado.mes.getFullYear(), estado.mes.getMonth() - i, 1);
    const k = iso(d).slice(0, 7);
    const tt = totaisDe(estado.dados.dias.filter((x) => mesDe(x.data) === k));
    const gg = estado.dados.gastos.filter((x) => mesDe(x.data) === k).reduce((s, x) => s + num(x.valor), 0);
    meses.push({ rotulo: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), lucro: tt.valor - tt.combustivel - gg });
  }
  const max = Math.max(1, ...meses.map((m) => Math.abs(m.lucro)));
  const nomePeriodo = { mes: nomeMes(estado.mes), ano: `ano de ${ano}`, tudo: 'todo o período' }[estado.periodo];

  return `
    <section class="cartao">
      <div class="linha">
        ${estado.periodo === 'tudo' ? '<h2>Todo o período</h2>' : navMes()}
        <fieldset class="segmentado" style="border:0;padding:0;margin:0;grid-template-columns:repeat(3,auto)">
          <legend class="sutil" style="position:absolute;left:-9999px">Período</legend>
          ${[['mes', 'Mês'], ['ano', 'Ano'], ['tudo', 'Tudo']].map(([v, r]) => `<label style="padding:0 .8rem;min-height:38px"><input type="radio" name="periodo" value="${v}" ${estado.periodo === v ? 'checked' : ''}><span>${r}</span></label>`).join('')}
        </fieldset>
      </div>
      <p class="sutil" style="margin-top:.6rem">Resultado de ${esc(nomePeriodo)}</p>
      <div class="numeros">
        <div class="numero-cartao"><span>Recebido pelos dias</span><strong>${brl(t.valor)}</strong></div>
        <div class="numero-cartao"><span>Combustível</span><strong>− ${brl(t.combustivel)}</strong></div>
        <div class="numero-cartao"><span>Outros gastos</span><strong>− ${brl(gastos)}</strong></div>
        <div class="numero-cartao destaque ${lucro >= 0 ? 'positivo' : 'negativo'}"><span>${lucro >= 0 ? 'Lucro' : 'Prejuízo'}</span><strong>${brl(lucro)}</strong></div>
      </div>
      <p style="margin-top:.75rem">${t.dias === 0 ? 'Sem dias registrados neste período.'
        : lucro >= 0 ? `✅ Está dando lucro: sobra <strong>${brl(lucro)}</strong>, cerca de <strong>${brl(h ? lucro / h : 0)} por hora</strong> dirigindo.`
        : `⚠️ Está dando prejuízo de <strong>${brl(-lucro)}</strong>. Vale rever o valor por percurso em Ajustes.`}</p>
    </section>
    <section class="cartao">
      <h3>Números do período</h3>
      <div class="numeros">
        <div class="numero-cartao"><span>Dias que levei</span><strong>${t.dias}</strong></div>
        <div class="numero-cartao"><span>Percursos</span><strong>${t.percursos}</strong></div>
        <div class="numero-cartao"><span>Km rodados</span><strong>${dec(t.km)} km</strong></div>
        <div class="numero-cartao"><span>Tempo no carro</span><strong>${horas(t.minutos)}</strong></div>
        <div class="numero-cartao"><span>Custo por km</span><strong>${brl(t.km ? custo / t.km : 0)}</strong></div>
        <div class="numero-cartao"><span>Lucro por percurso</span><strong>${brl(t.percursos ? lucro / t.percursos : 0)}</strong></div>
      </div>
    </section>
    <section class="cartao">
      <h3>Lucro dos últimos 6 meses</h3>
      <div class="barras" role="list">${meses.map((m) => `<div class="barra-linha" role="listitem">
        <span style="text-transform:capitalize">${esc(m.rotulo)}</span>
        <div class="barra-trilho"><div class="barra ${m.lucro < 0 ? 'neg' : ''}" style="width:${Math.abs(m.lucro) / max * 100}%"></div></div>
        <strong>${brl(m.lucro)}</strong></div>`).join('')}</div>
    </section>
    ${cartaoSaldo()}`;
}

// =================================================================
// Tela: Ajustes (admin)
// =================================================================
function telaAjustes() {
  const c = cfg();
  return `
    <section class="cartao">
      <h2>Ajustes</h2>
      <p class="sutil">Esses valores preenchem os novos registros. Os dias já salvos não mudam.</p>
      <form id="form-ajustes" class="grade-form" novalidate>
        <h3>Quanto você recebe</h3>
        <div class="duas-col">
          <label>Valor por percurso (R$) <input name="valor_percurso" type="number" min="0" step="0.01" inputmode="decimal" value="${num(c.valor_percurso)}"></label>
          <label>Percursos num dia normal <span class="ajuda-campo">Ida e volta = 2</span><input name="percursos_por_dia" type="number" min="1" max="10" inputmode="numeric" value="${num(c.percursos_por_dia)}"></label>
        </div>
        <h3>O trajeto (um percurso)</h3>
        <div class="duas-col">
          <label>Distância (km) <input name="km_percurso" type="number" min="0" step="0.1" inputmode="decimal" value="${num(c.km_percurso)}"></label>
          <label>Tempo (minutos) <input name="minutos_percurso" type="number" min="0" inputmode="numeric" value="${num(c.minutos_percurso)}"></label>
        </div>
        <h3>O carro</h3>
        <div class="duas-col">
          <label>Consumo (km por litro) <input name="consumo_km_l" type="number" min="0.1" step="0.1" inputmode="decimal" value="${num(c.consumo_km_l)}"></label>
          <label>Preço do combustível (R$/litro) <input name="preco_combustivel" type="number" min="0" step="0.01" inputmode="decimal" value="${num(c.preco_combustivel)}"></label>
        </div>
        <h3>Dias de aula</h3>
        <div class="dias-semana">${SEMANA_LONGA.map((n, i) => `<label><input type="checkbox" name="dias_semana" value="${i}" ${c.dias_semana.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div>
        <p class="previa" id="previa-ajustes" aria-live="polite"></p>
        <p class="erro" id="erro-ajustes" role="alert" hidden></p>
        <div><button type="submit" class="botao primario">Salvar ajustes</button></div>
      </form>
    </section>`;
}

function previaAjustes(f) {
  const v = Object.fromEntries(['valor_percurso', 'percursos_por_dia', 'km_percurso', 'minutos_percurso', 'consumo_km_l', 'preco_combustivel'].map((k) => [k, num(f[k].value)]));
  const km = v.km_percurso * v.percursos_por_dia;
  const receita = v.valor_percurso * v.percursos_por_dia;
  const comb = custoCombustivel(km, v);
  $('#previa-ajustes').innerHTML = `Um dia normal: ${v.percursos_por_dia} percursos, ${dec(km)} km, ${horas(v.minutos_percurso * v.percursos_por_dia)} → recebe <strong>${brl(receita)}</strong>, gasta ~<strong>${brl(comb)}</strong> de combustível, sobra <strong>${brl(receita - comb)}</strong>.`;
  return v;
}

// =================================================================
// Tela: Ajuda (heurística 10)
// =================================================================
function telaAjuda() {
  const admin = estado.admin;
  return `<section class="cartao">
    <h2>Ajuda</h2>
    ${admin ? `
    <details open><summary>Como registro que levei a Bibi?</summary><p>Na aba <strong>Dias</strong>, toque em <strong>“Levei hoje”</strong>. Pronto: o app usa os valores padrão dos Ajustes. Se foi diferente (só ida, outro valor), toque em <strong>“Outro valor…”</strong> ou no dia no calendário.</p></details>
    <details><summary>Esqueci de marcar um dia. E agora?</summary><p>Dias de aula passados sem registro aparecem em amarelo com “?” e numa lista no topo. Marque “Levei” ou “Não levei” em cada um, ou use “Marcar todos como levei”.</p></details>
    <details><summary>Levei num dia que não é de aula (ex.: quinta)</summary><p>Toque no dia no calendário e salve como “Levei”. Ele aparece com uma bolinha roxa de “dia extra”.</p></details>
    <details><summary>Errei. Como desfaço?</summary><p>Depois de salvar ou excluir, aparece um aviso embaixo com <strong>“Desfazer”</strong>. Também dá para tocar no dia e corrigir quando quiser.</p></details>
    <details><summary>Como o lucro é calculado?</summary><p>Lucro = valor recebido pelos dias − combustível − outros gastos. O combustível de cada dia é estimado: km ÷ consumo × preço do litro, com o preço que estava em Ajustes no dia do registro.</p></details>
    <details><summary>Como mando o resumo para a tia?</summary><p>Na aba Dias, em “Total do mês”, toque em <strong>“Copiar resumo”</strong> e cole no WhatsApp. A tia também pode entrar no app com o usuário dela e ver os dias e pagamentos (ela não vê gastos nem lucro).</p></details>`
    : `
    <details open><summary>O que aparece aqui?</summary><p>Os dias em que a Bibi foi levada para a aula, quantos percursos foram feitos e o valor de cada dia.</p></details>
    <details><summary>Como vejo outro mês?</summary><p>Use as setas ‹ › ao lado do nome do mês.</p></details>
    <details><summary>O que é “percurso”?</summary><p>Cada trajeto de carro. Ida e volta no mesmo dia contam como 2 percursos.</p></details>
    <details><summary>Como sei quanto falta pagar?</summary><p>Veja o “Saldo geral” no fim da aba Dias ou na aba Pagamentos.</p></details>
    <details><summary>Achei um dia errado</summary><p>Avise quem registrou; só o admin pode corrigir os registros.</p></details>`}
    <p class="sutil" style="margin-top:1rem">Dica: no celular, use “Adicionar à tela de início” no menu do navegador para abrir o app como um aplicativo.</p>
  </section>`;
}

// =================================================================
// Diálogo genérico
// =================================================================
let aoEnviar = null;
function abrirDialogo(html, enviar) {
  const dlg = $('#dialogo'); const f = $('#dialogo-form');
  f.innerHTML = html; aoEnviar = enviar || null;
  $$('[data-fechar]', f).forEach((b) => b.addEventListener('click', fecharDialogo));
  dlg.showModal();
  const primeiro = $('input:not([type=radio]):not([type=hidden]), select', f);
  if (primeiro && !('ontouchstart' in window)) primeiro.focus();
}
function fecharDialogo() { $('#dialogo').close(); }
$('#dialogo-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!aoEnviar) return fecharDialogo();
  const f = ev.target; const botao = $('button[type=submit]', f);
  botao.disabled = true; const texto = botao.textContent; botao.textContent = 'Salvando…';
  const erro = await aoEnviar(f);
  botao.disabled = false; botao.textContent = texto;
  if (erro) { const el = $('#erro-dialogo'); el.hidden = false; el.textContent = erro; } else fecharDialogo();
});
$('#dialogo').addEventListener('click', (ev) => { if (ev.target.id === 'dialogo') fecharDialogo(); });

// =================================================================
// Eventos de cada tela
// =================================================================
function ligarEventos() {
  const c = $('#conteudo');
  $$('[data-mes]', c).forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.mes);
    const agora = new Date();
    estado.mes = d === 0 ? new Date(agora.getFullYear(), agora.getMonth(), 1) : new Date(estado.mes.getFullYear(), estado.mes.getMonth() + d, 1);
    render();
  }));
  $$('[data-abrir-dia]', c).forEach((b) => b.addEventListener('click', () => abrirDia(b.dataset.abrirDia)));
  $$('[data-rapido]', c).forEach((b) => b.addEventListener('click', () => { b.disabled = true; registroRapido(b.dataset.rapido, b.dataset.status); }));
  $('#todos-levei', c)?.addEventListener('click', async () => {
    const pend = diasPendentes();
    if (!confirm(`Marcar ${pend.length} dias como “levei” com os valores padrão (${brl(pend.length * cfg().percursos_por_dia * cfg().valor_percurso)} no total)?`)) return;
    const criados = [];
    await executar(async () => {
      for (const s of pend) { const d = diaPadrao(s, 'levei'); criados.push(await api.salvarDia(d, custoCombustivel(d.km))); }
    }, `${pend.length} dias marcados como “levei”.`, () => executar(async () => { for (const d of criados) await api.excluirDia(d.id); }, 'Marcação desfeita.'));
  });
  $('#copiar-mes', c)?.addEventListener('click', async () => {
    const texto = textoResumoMes();
    try { await navigator.clipboard.writeText(texto); avisar('Resumo copiado. Cole no WhatsApp.'); }
    catch { abrirDialogo(`<h2 id="dialogo-titulo">Resumo do mês</h2><p class="sutil">Selecione e copie:</p><textarea rows="10" readonly>${esc(texto)}</textarea><div class="dialogo-acoes"><button type="button" class="botao primario" data-fechar>Fechar</button></div>`); }
  });
  $('#novo-pagamento', c)?.addEventListener('click', () => abrirPagamento());
  $$('[data-pagamento]', c).forEach((b) => b.addEventListener('click', () => abrirPagamento(b.dataset.pagamento)));
  $('#novo-gasto', c)?.addEventListener('click', () => abrirGasto());
  $$('[data-gasto]', c).forEach((b) => b.addEventListener('click', () => abrirGasto(b.dataset.gasto)));
  $$('input[name=periodo]', c).forEach((r) => r.addEventListener('change', () => { estado.periodo = r.value; render(); }));

  const fa = $('#form-ajustes', c);
  if (fa) {
    previaAjustes(fa);
    fa.addEventListener('input', () => previaAjustes(fa));
    fa.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = previaAjustes(fa);
      v.dias_semana = $$('input[name=dias_semana]:checked', fa).map((i) => Number(i.value));
      const erro = $('#erro-ajustes');
      const problema = v.consumo_km_l <= 0 ? 'O consumo precisa ser maior que zero.'
        : v.percursos_por_dia < 1 ? 'Um dia normal precisa ter pelo menos 1 percurso.'
        : Object.values(v).some((x) => typeof x === 'number' && x < 0) ? 'Os valores não podem ser negativos.'
        : !v.dias_semana.length ? 'Escolha pelo menos um dia de aula.' : null;
      erro.hidden = !problema; erro.textContent = problema || '';
      if (problema) return;
      await executar(() => api.salvarConfig(v), 'Ajustes salvos.');
    });
  }
}

window.addEventListener('offline', () => avisar('Você está sem internet. As alterações não serão salvas até a conexão voltar.', { erro: true }));
window.addEventListener('online', () => { avisar('Conexão de volta.'); recarregar().catch(() => {}); });

iniciar();
