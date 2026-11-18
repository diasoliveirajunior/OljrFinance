import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Bell, ChevronRight, CreditCard, FileInput, Fuel, Landmark, LayoutDashboard, LineChart,
  List, LogOut, Moon, Plus, Sun, TrendingUp, Trash2, Wallet,
} from "lucide-react"
import { useAuth } from "@/contexts/auth"
import { useTheme } from "@/hooks/useTheme"
import { NovoLancamentoModal } from "@/components/finance/NovoLancamentoModal"
import {
  NovaContaModal, NovoCartaoModal, NovoInvestimentoModal,
} from "@/components/finance/CadastrosModais"
import { ImportarOFXModal } from "@/components/finance/ImportarOFXModal"
import {
  fmtBRL, fmtDataCurta,
  getCombustivel, getPatrimonio, listarCartoes, listarContas,
  listarInvestimentos, listarLancamentos, removerLancamento,
  type FormaPagamento,
} from "@/lib/finance-api"

const FORMA_LABEL: Record<FormaPagamento, string> = {
  pix: "Pix", debito: "Débito", credito: "Crédito",
  transferencia: "Transferência", extrato: "Débito em conta", dinheiro: "Dinheiro",
}

const CATEGORIA_CORES: Record<string, string> = {
  Mercado: "#3b82f6", Combustível: "#f59e0b", Transporte: "#f59e0b",
  Moradia: "#8b5cf6", Saúde: "#ec4899", Educação: "#06b6d4", Lazer: "#8b5cf6",
  Vestuário: "#f43f5e", Assinaturas: "#a855f7", Pets: "#14b8a6",
  Salário: "#10b981", Freelance: "#10b981", Rendimento: "#10b981",
  Reembolso: "#10b981", Presente: "#10b981", Outros: "#64748b",
}
function corDaCategoria(c: string): string { return CATEGORIA_CORES[c] || "#64748b" }
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}
function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

export function PainelFinance() {
  const { me, logout } = useAuth()
  const qc = useQueryClient()
  const [mode, toggleTheme] = useTheme()
  const [modalAberto, setModalAberto] = useState(false)
  const [contaAberta, setContaAberta] = useState(false)
  const [cartaoAberto, setCartaoAberto] = useState(false)
  const [investAberto, setInvestAberto] = useState(false)
  const [importAberto, setImportAberto] = useState(false)
  const [filtroForma, setFiltroForma] = useState<FormaPagamento | "todas">("todas")

  const patrimonioQ = useQuery({ queryKey: ["finance", "patrimonio"], queryFn: getPatrimonio })
  const contasQ = useQuery({ queryKey: ["finance", "contas"], queryFn: listarContas })
  const cartoesQ = useQuery({ queryKey: ["finance", "cartoes"], queryFn: listarCartoes })
  const invQ = useQuery({ queryKey: ["finance", "investimentos"], queryFn: listarInvestimentos })
  const combQ = useQuery({ queryKey: ["finance", "combustivel"], queryFn: getCombustivel })
  const lancQ = useQuery({
    queryKey: ["finance", "lancamentos", "ultimos"],
    queryFn: () => listarLancamentos({ limit: 30 }),
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => removerLancamento(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  })

  const isOwner = me?.email?.toLowerCase() === "diasoliveirajunior@gmail.com"
  const nome = isOwner ? "Oliveira Junior" : (me?.usuario?.nome || me?.email || "")
  const primeiro = nome.split(/\s+/)[0]
  const papel = me?.usuario?.papel === "admin" || me?.usuario?.papel === "CEO" ? "CEO"
    : me?.usuario?.papel === "co_gestor" ? "Co-gestor"
    : me?.usuario?.papel === "membro" ? "Membro"
    : "Convidado"
  const contas = contasQ.data?.contas ?? []
  const cartoes = cartoesQ.data?.cartoes ?? []
  const investimentos = invQ.data?.investimentos ?? []
  const todosLancamentos = useMemo(
    () => [...(lancQ.data?.lancamentos ?? [])].sort((a, b) => b.data.localeCompare(a.data)),
    [lancQ.data],
  )
  const lancamentos = useMemo(() => {
    if (filtroForma === "todas") return todosLancamentos.slice(0, 15)
    return todosLancamentos.filter((l) => l.forma_pagamento === filtroForma).slice(0, 15)
  }, [todosLancamentos, filtroForma])
  const pat = patrimonioQ.data
  const comb = combQ.data

  const labelDestino = (contaId?: string | null, cartaoId?: string | null) => {
    if (contaId) {
      const c = contas.find((x) => x.id === contaId)
      return c ? `${c.nome} · conta` : "Conta removida"
    }
    if (cartaoId) {
      const c = cartoes.find((x) => x.id === cartaoId)
      return c ? `${c.nome} · cartão` : "Cartão removido"
    }
    return "Sem conta vinculada"
  }

  return (
    <div className="ff-app">
      <aside className="ff-sidebar">
        <div className="ff-brand">
          <div className="ff-brand-icon"><Wallet className="size-[18px]" /></div>
          <div>
            <div className="ff-brand-text">OLJR Finance</div>
            <div className="ff-brand-sub">Oliveira Junior</div>
          </div>
        </div>
        <nav className="ff-nav">
          <button className="ff-nav-item is-active"><LayoutDashboard className="size-4" /> Visão geral</button>
          <button className="ff-nav-item" onClick={() => setModalAberto(true)}><Landmark className="size-4" /> Contas</button>
          <button className="ff-nav-item"><CreditCard className="size-4" /> Cartões</button>
          <button className="ff-nav-item"><TrendingUp className="size-4" /> Investimentos</button>
          <button className="ff-nav-item"><List className="size-4" /> Movimentações</button>
          <button className="ff-nav-item" onClick={() => setImportAberto(true)}>
            <FileInput className="size-4" /> Importar extrato
          </button>
          <button className="ff-nav-item"><LineChart className="size-4" /> Relatórios</button>
        </nav>
        <div className="ff-sidebar-footer">
          <div className="ff-avatar">{iniciais(nome)}</div>
          <div className="ff-user-info">
            <div className="ff-user-name">{nome}</div>
            <div className="ff-user-role">{papel}</div>
          </div>
          <button className="ff-icon-btn" onClick={() => logout()} aria-label="Sair" title="Sair">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <main className="ff-main">
        <div className="ff-topbar">
          <div>
            <h1>{saudacao()}, {primeiro}</h1>
            <div className="ff-topbar-meta">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
          </div>
          <div className="ff-topbar-actions">
            <button className="ff-icon-btn" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar claro/escuro">
              {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button className="ff-icon-btn" aria-label="Notificações" title="Notificações">
              <Bell className="size-4" />
            </button>
            <button className="ff-btn ff-btn--primary" onClick={() => setModalAberto(true)}>
              <Plus className="size-4" /> Lançar
            </button>
          </div>
        </div>

        <section className="ff-patrimonio">
          <div className="ff-patrimonio-main">
            <div className="ff-label">Patrimônio total</div>
            {patrimonioQ.isLoading || !pat ? (
              <div className="ff-skeleton" style={{ width: 260, height: 44 }} />
            ) : (
              <div className="ff-patrimonio-value">{fmtBRL(pat.patrimonio_total)}</div>
            )}
            <div className="ff-patrimonio-hint">
              {contas.length} {contas.length === 1 ? "conta" : "contas"} ·{" "}
              {cartoes.length} {cartoes.length === 1 ? "cartão" : "cartões"} ·{" "}
              {investimentos.length} {investimentos.length === 1 ? "investimento" : "investimentos"}
            </div>
          </div>
          <div className="ff-patrimonio-stats">
            <div className="ff-stat">
              <div className="ff-label">Em contas</div>
              <div className="ff-stat-value">{pat ? fmtBRL(pat.contas) : "—"}</div>
            </div>
            <div className="ff-stat">
              <div className="ff-label">Investido</div>
              <div className="ff-stat-value">{pat ? fmtBRL(pat.investimentos) : "—"}</div>
            </div>
            <div className="ff-stat">
              <div className="ff-label">Receitas · mês</div>
              <div className="ff-stat-value ff-up">{pat ? "+ " + fmtBRL(pat.receita_mes) : "—"}</div>
            </div>
            <div className="ff-stat">
              <div className="ff-label">Despesas · mês</div>
              <div className="ff-stat-value ff-down">{pat ? "- " + fmtBRL(pat.despesa_mes) : "—"}</div>
            </div>
          </div>
        </section>

        <SecaoHead titulo="Contas" />
        {contasQ.isLoading ? <SkeletonCards /> : (
          <div className="ff-cards-row">
            {contas.map((c) => (
              <article key={c.id} className="ff-bank-card">
                <div className="ff-bank-card-top">
                  <div className="ff-bank-logo" style={{ background: c.cor }}>{iniciais(c.nome)}</div>
                  <div className="min-w-0">
                    <div className="ff-card-name">{c.nome}</div>
                    <div className="ff-card-type">{labelConta(c.tipo)}</div>
                  </div>
                </div>
                <div className="ff-card-saldo">{fmtBRL(c.saldo_atual)}</div>
                {c.banco && <div className="ff-card-meta"><span>{c.banco}</span></div>}
              </article>
            ))}
            <button className="ff-bank-card ff-add-card" onClick={() => setContaAberta(true)}>
              <Plus className="size-5" /> Nova conta
            </button>
          </div>
        )}

        {(cartoesQ.isLoading || cartoes.length > 0) && (
          <>
            <SecaoHead titulo="Cartões de crédito" />
            {cartoesQ.isLoading ? <SkeletonCards /> : (
              <div className="ff-cards-row">
                {cartoes.map((c) => (
                  <article key={c.id} className="ff-credit-card">
                    <div className="ff-bank-card-top">
                      <div className="ff-bank-logo" style={{ background: c.cor }}>{iniciais(c.nome)}</div>
                      <div className="min-w-0">
                        <div className="ff-card-name">{c.nome}</div>
                        <div className="ff-card-type">
                          {c.banco ? c.banco + " · " : ""}Fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="ff-label">Fatura aberta</div>
                      <div className="ff-card-saldo">{fmtBRL(c.fatura_atual)}</div>
                    </div>
                    <div className="ff-card-meta">
                      <span>Limite livre: <strong>{fmtBRL(c.limite_disponivel)}</strong></span>
                      <span>{c.percentual}% usado</span>
                    </div>
                    <div className="ff-limit-bar"><div className="ff-limit-fill" style={{ width: Math.min(100, c.percentual) + "%" }} /></div>
                    {c.divida_inicial > 0 && (
                      <div className="ff-card-warn">
                        {fmtBRL(c.divida_inicial)} já comprometidos por dívidas antigas
                      </div>
                    )}
                  </article>
                ))}
                <button className="ff-bank-card ff-add-card" onClick={() => setCartaoAberto(true)}>
                  <Plus className="size-5" /> Novo cartão
                </button>
              </div>
            )}
          </>
        )}
        {!cartoesQ.isLoading && cartoes.length === 0 && (
          <button className="ff-empty-add" onClick={() => setCartaoAberto(true)}>
            <CreditCard className="size-4" /> Adicionar cartão de crédito
          </button>
        )}

        {(invQ.isLoading || investimentos.length > 0) && (
          <>
            <SecaoHead titulo="Investimentos" />
            {invQ.isLoading ? <SkeletonCards /> : (
              <div className="ff-cards-row">
                {investimentos.map((i) => (
                  <article key={i.id} className="ff-bank-card">
                    <div className="ff-bank-card-top">
                      <div className="ff-bank-logo" style={{ background: i.cor }}>{iniciais(i.nome)}</div>
                      <div className="min-w-0">
                        <div className="ff-card-name">{i.nome}</div>
                        <div className="ff-card-type">{labelInvestimento(i.tipo)}{i.instituicao ? " · " + i.instituicao : ""}</div>
                      </div>
                    </div>
                    <div className="ff-card-saldo">{fmtBRL(i.valor_atual)}</div>
                    <div className="ff-card-meta">
                      <span>Aplicado {fmtBRL(i.valor_aplicado)}</span>
                      <span className={i.rentabilidade_real >= 0 ? "ff-yield-pill" : "ff-yield-pill ff-neg"}>
                        {i.rentabilidade_real >= 0 ? "+ " : ""}{i.rentabilidade_real.toFixed(1)}%
                      </span>
                    </div>
                  </article>
                ))}
                <button className="ff-bank-card ff-add-card" onClick={() => setInvestAberto(true)}>
                  <Plus className="size-5" /> Novo investimento
                </button>
              </div>
            )}
          </>
        )}
        {!invQ.isLoading && investimentos.length === 0 && (
          <button className="ff-empty-add" onClick={() => setInvestAberto(true)}>
            <TrendingUp className="size-4" /> Adicionar investimento
          </button>
        )}

        {comb && comb.abastecimentos >= 1 && (
          <>
            <SecaoHead titulo="Veículo" />
            <article className="ff-vehicle-card">
              <div className="ff-vehicle-icon"><Fuel className="size-5" /></div>
              <div className="ff-vehicle-stats">
                <div className="ff-vstat">
                  <div className="ff-label">Consumo médio</div>
                  <div className="ff-vstat-value">
                    {comb.consumo_medio_km_l > 0
                      ? comb.consumo_medio_km_l.toFixed(1).replace(".", ",") + " km/l"
                      : "— sem dados"}
                  </div>
                  <div className="ff-vstat-hint">
                    {comb.amostras_consumo} {comb.amostras_consumo === 1 ? "amostra" : "amostras"}
                  </div>
                </div>
                <div className="ff-vstat">
                  <div className="ff-label">Preço médio litro (mês)</div>
                  <div className="ff-vstat-value">
                    {comb.preco_medio_litro_mes > 0
                      ? "R$ " + comb.preco_medio_litro_mes.toFixed(3).replace(".", ",")
                      : "—"}
                  </div>
                </div>
                <div className="ff-vstat">
                  <div className="ff-label">Km rodados · mês</div>
                  <div className="ff-vstat-value">
                    {comb.km_rodados_mes > 0 ? comb.km_rodados_mes.toLocaleString("pt-BR") + " km" : "—"}
                  </div>
                </div>
                <div className="ff-vstat">
                  <div className="ff-label">Gasto · mês</div>
                  <div className="ff-vstat-value">{fmtBRL(comb.gasto_mes)}</div>
                </div>
              </div>
            </article>
          </>
        )}

        <SecaoHead titulo="Últimas movimentações" />
        <div className="ff-filters">
          {(["todas", "pix", "debito", "credito", "transferencia", "extrato", "dinheiro"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={filtroForma === f ? "ff-chip is-active" : "ff-chip"}
              onClick={() => setFiltroForma(f)}
            >
              {f === "todas" ? "Todas" : FORMA_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="ff-transactions">
          {lancQ.isLoading ? (
            <div className="ff-skeleton" style={{ height: 220 }} />
          ) : lancamentos.length === 0 ? (
            <div className="ff-empty">
              Nenhum lançamento ainda. Clique em <strong>Lançar</strong> no topo pra registrar o primeiro.
            </div>
          ) : (
            lancamentos.map((l) => {
              const cor = corDaCategoria(l.categoria)
              return (
                <div key={l.id} className="ff-tx">
                  <div className="ff-tx-icon" style={{ background: cor + "1f", color: cor }}>
                    {l.tipo === "receita" ? <ChevronRight className="size-4" style={{ transform: "rotate(-90deg)" }} /> : <ChevronRight className="size-4" style={{ transform: "rotate(90deg)" }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="ff-tx-desc">{l.descricao}</div>
                    <div className="ff-tx-meta">
                      {l.categoria} · {labelDestino(l.conta_id, l.cartao_id)}
                      {l.origem_texto ? " · " + l.origem_texto : ""}
                    </div>
                  </div>
                  <div className={l.tipo === "receita" ? "ff-tx-amount ff-in" : "ff-tx-amount ff-out"}>
                    {l.tipo === "receita" ? "+ " : "- "}{fmtBRL(l.valor)}
                  </div>
                  <div className="ff-tx-date">{fmtDataCurta(l.data)}</div>
                  <button
                    className="ff-tx-remove"
                    onClick={() => { if (confirm("Apagar este lançamento?")) removeMut.mutate(l.id) }}
                    disabled={removeMut.isPending}
                    aria-label="Apagar lançamento"
                    title="Apagar lançamento"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </main>

      <button className="ff-fab" onClick={() => setModalAberto(true)} aria-label="Novo lançamento" title="Novo lançamento">
        <Plus className="size-6" />
      </button>

      <NovoLancamentoModal
        aberto={modalAberto}
        fechar={() => setModalAberto(false)}
        contas={contas}
        cartoes={cartoes}
      />
      <NovaContaModal aberto={contaAberta} fechar={() => setContaAberta(false)} />
      <NovoCartaoModal aberto={cartaoAberto} fechar={() => setCartaoAberto(false)} />
      <NovoInvestimentoModal aberto={investAberto} fechar={() => setInvestAberto(false)} />
      <ImportarOFXModal
        aberto={importAberto}
        fechar={() => setImportAberto(false)}
        contas={contas}
        cartoes={cartoes}
      />
    </div>
  )
}

function SecaoHead({ titulo }: { titulo: string }) {
  return (
    <div className="ff-section-head">
      <h2>{titulo}</h2>
      <button className="ff-link"><span>Gerenciar</span><ChevronRight className="size-3" /></button>
    </div>
  )
}

function SkeletonCards() {
  return (
    <div className="ff-cards-row">
      {[1, 2, 3].map((i) => <div key={i} className="ff-skeleton" style={{ height: 118 }} />)}
    </div>
  )
}

function labelConta(t: string): string {
  return { corrente: "Conta corrente", poupanca: "Poupança", carteira: "Carteira", outra: "Outra" }[t] || t
}
function labelInvestimento(t: string): string {
  return ({
    tesouro: "Tesouro direto", cdb: "CDB", lci: "LCI", lca: "LCA",
    fundo: "Fundo", acao: "Ação", fii: "FII", cripto: "Cripto", poupanca: "Poupança", outro: "Outro",
  } as Record<string, string>)[t] || t
}
