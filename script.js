/* =========================================================
   MASSU | INTELIGÊNCIA FINANCEIRA
   Cadastro e leitura de investimentos no Supabase
   ========================================================= */

(() => {
  "use strict";

  const VAZIO = "-";

  const dinheiro = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const dataBR = (valor) => {
    if (!valor) return VAZIO;

    const data = new Date(`${String(valor).slice(0, 10)}T12:00:00`);

    if (Number.isNaN(data.getTime())) return VAZIO;

    return data.toLocaleDateString("pt-BR");
  };

  const valorBR = (valor) => {
    const numero = Number(valor);

    return Number.isFinite(numero) ? dinheiro.format(numero) : VAZIO;
  };

  const taxaBR = (valor) => {
    if (valor === null || valor === undefined || valor === "") {
      return VAZIO;
    }

    return `${Number(valor).toLocaleString("pt-BR")}%`;
  };

  const escaparHTML = (valor) =>
    String(valor ?? "").replace(
      /[&<>"']/g,
      (caractere) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[caractere],
    );

  // Cor do ícone de cada tipo (classes que já existem no style.css)
  const CORES_ICONE = {
    CDB: "green-bg",
    "Tesouro Direto": "purple-bg",
    LCI: "orange-bg",
    LCA: "orange-bg",
  };

  const PALETA_CARTEIRA = [
    "#ea580c",
    "#eab308",
    "#2563eb",
    "#dc2626",
    "#7c3aed",
    "#0891b2",
    "#be123c",
    "#16a34a",
  ];

  function corDoTipo(tipo, indice) {
    const coresFixas = {
      CDB: "#2563eb",
      "LCI/LCA": "#ea580c",
      "Tesouro Direto": "#eab308",
      Ações: "#dc2626",
      Fundos: "#7c3aed",
      Outro: "#0891b2",
    };

    return coresFixas[tipo] || PALETA_CARTEIRA[indice % PALETA_CARTEIRA.length];
  }

  // Rentabilidade exibida: taxa + indexador (ex.: 100% CDI)
  function rentabilidadeBR(item) {
    const taxa = taxaBR(item.taxa_percentual);

    if (taxa === VAZIO) return VAZIO;

    return item.indexador ? `${taxa} ${item.indexador}` : taxa;
  }

  // Situação calculada pela data de vencimento
  function situacaoDoInvestimento(item) {
    const ativo = { texto: "Ativo", classe: "status-active" };

    if (!item.data_vencimento) return ativo;

    const vencimento = new Date(
      `${String(item.data_vencimento).slice(0, 10)}T12:00:00`,
    );

    if (Number.isNaN(vencimento.getTime())) return ativo;

    const dias = Math.ceil((vencimento - new Date()) / 86400000);

    if (dias < 0) return { texto: "Vencido", classe: "status-attention" };
    if (dias <= 90) return { texto: "A vencer", classe: "status-attention" };

    return ativo;
  }

  function iniciarAplicacao() {
    const menu = document.querySelector("#sidebar");
    const botaoMenu = document.querySelector("#menu-toggle");

    botaoMenu?.addEventListener("click", () => {
      const aberto = menu.classList.toggle("open");
      botaoMenu.setAttribute("aria-expanded", String(aberto));
      botaoMenu.setAttribute(
        "aria-label",
        aberto ? "Fechar menu" : "Abrir menu",
      );
    });

    // Os ids abaixo precisam ser iguais aos do index.html
    const tabela = document.querySelector("#investment-table");
    const estadoVazio = document.querySelector("#empty-state");
    const botaoNovo = document.querySelector("#add-investment");
    const botaoExportar = document.querySelector("#export-button");
    const botaoRegistrarSaldo = document.querySelector("#record-balance");
    const campoPesquisa = document.querySelector("#investment-search");

    let investimentos = [];
    let historicoPatrimonio = [];
    let suporteMovimentacoes = true;
    let usuarioAtual = null;
    let clienteSupabase = null;

    window.verticeInvestimentos = investimentos;

    // -----------------------------------------------------
    // Navegação (só marca o link ativo, a rolagem é do href)
    // -----------------------------------------------------

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((item) => {
          item.classList.remove("active");
        });

        link.classList.add("active");
      });
    });

    // -----------------------------------------------------
    // Mensagens
    // -----------------------------------------------------

    function mensagem(texto, tipo = "info") {
      let aviso = document.querySelector("#vertice-aviso");

      if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "vertice-aviso";

        Object.assign(aviso.style, {
          position: "fixed",
          right: "20px",
          bottom: "20px",
          zIndex: "100001",
          maxWidth: "min(420px, calc(100vw - 40px))",
          padding: "14px 18px",
          borderRadius: "10px",
          background: "#172033",
          color: "#ffffff",
          border: "1px solid #374151",
          boxShadow: "0 8px 30px #0003",
          fontSize: "14px",
          lineHeight: "1.5",
        });

        document.body.appendChild(aviso);
      }

      aviso.textContent = texto;
      aviso.style.display = "block";
      aviso.style.borderColor = tipo === "erro" ? "#ef4444" : "#374151";

      window.clearTimeout(mensagem.temporizador);

      mensagem.temporizador = window.setTimeout(() => {
        aviso.style.display = "none";
      }, 6000);
    }

    // -----------------------------------------------------
    // Formulário de novo investimento
    // -----------------------------------------------------

    function prepararFormulario() {
      if (document.querySelector("#vertice-modal-investimento")) return;

      const estilos = document.createElement("style");

      estilos.textContent = `
        #vertice-modal-investimento {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(0, 0, 0, .72);
        }

        #vertice-modal-investimento.aberto {
          display: flex;
        }

        #vertice-modal-investimento .vertice-modal-card {
          width: 100%;
          max-width: 620px;
          max-height: 92vh;
          overflow-y: auto;
          padding: 24px;
          border: 1px solid #374151;
          border-radius: 16px;
          background: #111827;
          color: #f9fafb;
          box-shadow: 0 20px 60px #0007;
        }

        #vertice-modal-investimento .vertice-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 20px;
        }

        #vertice-modal-investimento .vertice-campo {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
        }

        #vertice-modal-investimento .vertice-campo label {
          font-size: 13px;
          color: #d1d5db;
        }

        #vertice-modal-investimento .vertice-campo input,
        #vertice-modal-investimento .vertice-campo select {
          box-sizing: border-box;
          width: 100%;
          min-height: 43px;
          padding: 10px;
          border: 1px solid #4b5563;
          border-radius: 8px;
          background: #1f2937;
          color: #f9fafb;
          font: inherit;
        }

        #vertice-modal-investimento .vertice-acoes {
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 24px;
        }

        #vertice-modal-investimento .vertice-erro {
          display: none;
          margin-top: 16px;
          padding: 12px;
          border: 1px solid #ef4444;
          border-radius: 8px;
          color: #fecaca;
          font-size: 13px;
          line-height: 1.5;
        }

        #vertice-modal-investimento .vertice-botao {
          min-height: 40px;
          padding: 10px 16px;
          border: 1px solid #4b5563;
          border-radius: 8px;
          cursor: pointer;
          font: inherit;
        }

        #vertice-modal-investimento .vertice-salvar {
          border-color: #2563eb;
          background: #2563eb;
          color: white;
        }

        #vertice-modal-investimento .vertice-cancelar {
          background: #1f2937;
          color: white;
        }

        @media (max-width: 520px) {
          #vertice-modal-investimento .vertice-form-grid {
            grid-template-columns: 1fr;
          }

          #vertice-modal-investimento .vertice-modal-card {
            padding: 18px;
          }
        }
      `;

      document.head.appendChild(estilos);

      const modal = document.createElement("div");

      modal.id = "vertice-modal-investimento";

      modal.innerHTML = `
        <div class="vertice-modal-card" role="dialog"
             aria-modal="true" aria-labelledby="vertice-form-titulo">
          <h2 id="vertice-form-titulo">Novo investimento</h2>
          <p style="color:#9ca3af;font-size:14px;line-height:1.5">
            Preencha os dados do investimento. Os campos com * são obrigatórios.
          </p>

          <form id="vertice-form-investimento">
            <div class="vertice-form-grid">
              <div class="vertice-campo">
                <label for="vertice-nome">Nome do investimento *</label>
                <input id="vertice-nome" name="nome"
                       placeholder="Ex.: LCI Banco X" required maxlength="150">
              </div>

              <div class="vertice-campo">
                <label for="vertice-tipo">Tipo *</label>
                <select id="vertice-tipo" name="tipo" required>
                  <option value="">Selecione</option>
                  <option value="CDB">CDB</option>
                  <option value="LCI">LCI</option>
                  <option value="LCA">LCA</option>
                  <option value="Tesouro Direto">Tesouro Direto</option>
                  <option value="Ações">Ações</option>
                  <option value="Fundos">Fundos</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div class="vertice-campo">
                <label for="vertice-instituicao">Instituição financeira</label>
                <input id="vertice-instituicao" name="instituicao"
                       placeholder="Ex.: Banco X" maxlength="150">
              </div>

              <div class="vertice-campo">
                <label for="vertice-valor">Valor investido (R$) *</label>
                <input id="vertice-valor" name="valor_investido"
                       type="number" min="0.01" step="0.01"
                       placeholder="1000,00" required>
              </div>

              <div class="vertice-campo">
                <label for="vertice-taxa">Taxa (%)</label>
                <input id="vertice-taxa" name="taxa_percentual"
                       type="number" min="0" step="0.01"
                       placeholder="Ex.: 100">
              </div>

              <div class="vertice-campo">
                <label for="vertice-indexador">Indexador</label>
                <select id="vertice-indexador" name="indexador">
                  <option value="">Não informado</option>
                  <option value="CDI">CDI</option>
                  <option value="IPCA">IPCA</option>
                  <option value="Selic">Selic</option>
                  <option value="Prefixado">Prefixado</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div class="vertice-campo">
                <label for="vertice-aplicacao">Data da aplicação</label>
                <input id="vertice-aplicacao" name="data_aplicacao"
                       type="date">
              </div>

              <div class="vertice-campo">
                <label for="vertice-vencimento">Data de vencimento</label>
                <input id="vertice-vencimento" name="data_vencimento"
                       type="date">
              </div>
            </div>

            <div id="vertice-form-erro" class="vertice-erro"
                 role="alert"></div>

            <div class="vertice-acoes">
              <button type="button" id="vertice-fechar-form"
                      class="vertice-botao vertice-cancelar">
                Cancelar
              </button>

              <button type="submit" id="vertice-salvar-form"
                      class="vertice-botao vertice-salvar">
                Salvar investimento
              </button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);

      const formulario = modal.querySelector("#vertice-form-investimento");

      function mostrarErroFormulario(texto) {
        const elemento = modal.querySelector("#vertice-form-erro");
        elemento.textContent = texto;
        elemento.style.display = texto ? "block" : "none";
      }

      function fecharFormulario() {
        modal.classList.remove("aberto");
        formulario.reset();
        mostrarErroFormulario("");
      }

      modal
        .querySelector("#vertice-fechar-form")
        .addEventListener("click", fecharFormulario);

      modal.addEventListener("click", (evento) => {
        if (evento.target === modal) fecharFormulario();
      });

      document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") fecharFormulario();
      });

      formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();

        const botaoSalvar = modal.querySelector("#vertice-salvar-form");
        const nome = formulario.elements.nome.value.trim();
        const tipo = formulario.elements.tipo.value;
        const valor = Number(formulario.elements.valor_investido.value);
        const taxaTexto = formulario.elements.taxa_percentual.value;
        const dataAplicacao = formulario.elements.data_aplicacao.value;
        const dataVencimento = formulario.elements.data_vencimento.value;

        if (!nome || !tipo || !Number.isFinite(valor) || valor <= 0) {
          mostrarErroFormulario(
            "Confira o nome, o tipo e o valor do investimento.",
          );
          return;
        }

        if (
          taxaTexto !== "" &&
          (!Number.isFinite(Number(taxaTexto)) || Number(taxaTexto) < 0)
        ) {
          mostrarErroFormulario("Confira o valor da taxa.");
          return;
        }

        if (dataAplicacao && dataVencimento && dataVencimento < dataAplicacao) {
          mostrarErroFormulario(
            "A data de vencimento não pode ser anterior à data da aplicação.",
          );
          return;
        }

        if (!clienteSupabase || !usuarioAtual) {
          mostrarErroFormulario(
            "Sua sessão não foi identificada. Entre novamente na sua conta.",
          );
          return;
        }

        const registro = {
          user_id: usuarioAtual.id,
          nome,
          tipo,
          instituicao: formulario.elements.instituicao.value.trim() || null,
          valor_investido: valor,
          taxa_percentual: taxaTexto === "" ? null : Number(taxaTexto),
          indexador: formulario.elements.indexador.value || null,
          data_aplicacao: dataAplicacao || null,
          data_vencimento: dataVencimento || null,
        };

        botaoSalvar.disabled = true;
        botaoSalvar.textContent = "Salvando...";
        mostrarErroFormulario("");

        try {
          const { error } = await clienteSupabase
            .from("investimentos")
            .insert(registro);

          if (error) {
            console.error("Erro ao salvar investimento:", error);
            mostrarErroFormulario(interpretarErroSupabase(error));
            return;
          }

          fecharFormulario();

          const recarregou = await carregarInvestimentos();

          // Só avisa que deu certo se a lista também atualizou.
          // Se a leitura falhar, o aviso de erro dela continua na tela.
          if (recarregou) {
            mensagem("Investimento salvo com sucesso.");
          }
        } catch (erro) {
          console.error("Erro inesperado ao salvar:", erro);
          mostrarErroFormulario(
            "Não foi possível salvar. Tente novamente e, se continuar, envie a mensagem de erro ao professor.",
          );
        } finally {
          botaoSalvar.disabled = false;
          botaoSalvar.textContent = "Salvar investimento";
        }
      });

      modal.abrir = () => {
        modal.classList.add("aberto");
        mostrarErroFormulario("");
        modal.querySelector("#vertice-nome").focus();
      };
    }

    // -----------------------------------------------------
    // Filtro da tabela (busca) e mensagem de lista vazia
    // -----------------------------------------------------

    function aplicarFiltro() {
      if (!tabela) return;

      const termo = campoPesquisa
        ? campoPesquisa.value.trim().toLocaleLowerCase("pt-BR")
        : "";

      let visiveis = 0;

      tabela.querySelectorAll("tr").forEach((linha) => {
        const mostrar = linha.textContent
          .toLocaleLowerCase("pt-BR")
          .includes(termo);

        linha.hidden = !mostrar;

        if (mostrar) visiveis += 1;
      });

      if (!estadoVazio) return;

      if (investimentos.length === 0) {
        estadoVazio.textContent = "Nenhum investimento cadastrado ainda.";
        estadoVazio.hidden = false;
      } else if (visiveis === 0) {
        estadoVazio.textContent =
          "Nenhum investimento encontrado com esse nome.";
        estadoVazio.hidden = false;
      } else {
        estadoVazio.hidden = true;
      }
    }

    // -----------------------------------------------------

    // -----------------------------------------------------
    // Atualizar gráfico com a distribuição real da carteira
    // -----------------------------------------------------

    function atualizarGraficoDistribuicao() {
      if (typeof Chart === "undefined") return;

      const canvas = document.querySelector(
        'canvas[data-chart-type="doughnut"]',
      );

      if (!canvas) return;

      const grafico = Chart.getChart(canvas);
      if (!grafico) return;

      const grupos = new Map();

      investimentos.forEach((item) => {
        const tipoOriginal = String(item.tipo || "Outro").trim();
        const tipoNormalizado = tipoOriginal.toUpperCase();

        const tipo =
          tipoNormalizado === "LCI" || tipoNormalizado === "LCA"
            ? "LCI/LCA"
            : tipoOriginal;

        const valor = Number(item.valor_investido);

        if (!Number.isFinite(valor) || valor <= 0) return;

        grupos.set(tipo, (grupos.get(tipo) || 0) + valor);
      });

      const tipos = [...grupos.keys()];
      const valores = [...grupos.values()];
      const total = valores.reduce((soma, valor) => soma + valor, 0);

      grafico.data.labels = tipos;
      grafico.data.datasets[0].data = valores;
      grafico.data.datasets[0].label = "Valor investido";
      grafico.data.datasets[0].backgroundColor = tipos.map(corDoTipo);
      grafico.data.datasets[0].borderColor = "#111827";
      grafico.data.datasets[0].borderWidth = 3;

      const elementoTotal = document.getElementById("allocation-total");
      const legenda = document.getElementById("allocation-legend");

      if (elementoTotal) {
        elementoTotal.textContent =
          total > 0
            ? `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            : "R$ 0,00";
      }

      if (legenda) {
        legenda.innerHTML = tipos
          .map((tipo, indice) => {
            const percentual = total > 0 ? (valores[indice] / total) * 100 : 0;
            const cor = corDoTipo(tipo, indice);

            return `
              <div class="legend-item">
                <span class="legend-name">
                  <span class="legend-dot" style="background:${cor}"></span>
                  ${escaparHTML(tipo)}
                </span>
                <strong>${percentual.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}%</strong>
              </div>
            `;
          })
          .join("");
      }

      grafico.update();
    }

    function atualizarGraficoPatrimonio() {
      const canvas = document.querySelector("#patrimonio-chart");
      const grafico = canvas && typeof Chart !== "undefined"
        ? Chart.getChart(canvas)
        : null;

      if (!grafico) return;

      const filtro = document.querySelector("#period-filter");
      const meses = Number(filtro?.value || 6);
      const limite = new Date();
      limite.setMonth(limite.getMonth() - meses);
      const registros = historicoPatrimonio.filter((registro) =>
        new Date(`${registro.data_referencia}T00:00:00`) >= limite,
      );

      grafico.data.labels = registros.map((registro) =>
        dataBR(registro.data_referencia),
      );
      grafico.data.datasets[0].data = registros.map((registro) =>
        Number(registro.valor_total),
      );
      grafico.update();
    }

    function atualizarRendimentoMensal(comMovimentacoes) {
      const valorEl = document.querySelector("#monthly-return");
      const statusEl = document.querySelector("#monthly-return-status");
      if (valorEl) valorEl.textContent = dinheiro.format(0);

      const hoje = new Date();
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
      const registrosOrdenados = [...historicoPatrimonio].sort((a, b) =>
        String(a.data_referencia).localeCompare(String(b.data_referencia)),
      );
      const doMes = registrosOrdenados.filter((item) =>
        item.data_referencia >= inicioMes,
      );
      const anterior = registrosOrdenados
        .filter((item) => item.data_referencia < inicioMes)
        .at(-1);
      const abertura = anterior || doMes[0];
      const fechamento = doMes.at(-1);

      if (!abertura || !fechamento || abertura === fechamento) {
        if (statusEl) {
          if (historicoPatrimonio.length === 1) {
            statusEl.textContent =
              `Base inicial de ${dinheiro.format(Number(abertura.valor_total))} — atualize em outra data para calcular o rendimento`;
          } else if (abertura) {
            statusEl.textContent =
              "Atualize o saldo novamente em outra data para calcular o rendimento";
          } else {
            statusEl.textContent = "Atualize o saldo inicial deste mês";
          }
        }
        return;
      }

      const indiceAbertura = registrosOrdenados.indexOf(abertura);
      const indiceFechamento = registrosOrdenados.indexOf(fechamento);
      const periodo = registrosOrdenados.slice(
        indiceAbertura + 1,
        indiceFechamento + 1,
      );
      let movimentacoes = 0;

      if (comMovimentacoes && periodo.some((item) => item.movimentacao_liquida == null)) {
        if (statusEl) {
          statusEl.textContent =
            "Falta informar aportes menos resgates em algum saldo";
        }
        return;
      }

      if (comMovimentacoes) {
        movimentacoes = periodo.reduce(
          (soma, item) => soma + Number(item.movimentacao_liquida),
          0,
        );
      }

      const rendimento =
        Number(fechamento.valor_total) -
        Number(abertura.valor_total) -
        movimentacoes;

      if (valorEl) valorEl.textContent = dinheiro.format(rendimento);
      if (statusEl && comMovimentacoes) {
        statusEl.textContent = `Variação ajustada por aportes/resgates: ${dataBR(abertura.data_referencia)} a ${dataBR(fechamento.data_referencia)}`;
      } else if (statusEl) {
        statusEl.textContent =
          "Migração pendente no Supabase — cálculo baseado apenas na variação do saldo";
      }
    }

    async function carregarHistoricoPatrimonio() {
      if (!clienteSupabase || !usuarioAtual) return;

      let data;
      let error;
      let comMovimentacoes = true;

      try {
        ({ data, error } = await clienteSupabase
          .from("historico_patrimonio")
          .select("data_referencia, valor_total, movimentacao_liquida")
          .eq("user_id", usuarioAtual.id)
          .order("data_referencia", { ascending: true }));

        if (error && String(error.message).includes("movimentacao_liquida")) {
          comMovimentacoes = false;
          ({ data, error } = await clienteSupabase
            .from("historico_patrimonio")
            .select("data_referencia, valor_total")
            .eq("user_id", usuarioAtual.id)
            .order("data_referencia", { ascending: true }));
        }
      } catch (erro) {
        error = erro;
      }

      if (error) {
        console.error("Erro ao consultar histórico do patrimônio:", error);
        limparHistoricoPatrimonio();
        const variacao = document.querySelector("#patrimonio-variacao");
        if (variacao) variacao.textContent = "Histórico indisponível";
        return;
      }

      suporteMovimentacoes = comMovimentacoes;
      historicoPatrimonio = (Array.isArray(data) ? data : []).sort((a, b) =>
        String(a.data_referencia).localeCompare(String(b.data_referencia)),
      );

      if (historicoPatrimonio.length === 0) {
        const patrimonioAtual = investimentos.reduce((total, item) => {
          const valor = Number(item.valor_investido);
          return total + (Number.isFinite(valor) ? valor : 0);
        }, 0);

        if (patrimonioAtual > 0) {
          const hoje = new Date();
          const dataReferencia = `${hoje.getFullYear()}-${String(
            hoje.getMonth() + 1,
          ).padStart(2, "0")}-${String(hoje.getDate()).padStart(
            2,
            "0",
          )}`;
          const novoRegistro = {
            user_id: usuarioAtual.id,
            data_referencia: dataReferencia,
            valor_total: patrimonioAtual,
          };

          if (comMovimentacoes) {
            novoRegistro.movimentacao_liquida = 0;
          }

          try {
            const { error: erroInicial } = await clienteSupabase
              .from("historico_patrimonio")
              .insert(novoRegistro);

            if (!erroInicial) {
              await carregarHistoricoPatrimonio();
              return;
            }

            console.error(
              "Não foi possível criar o saldo inicial:",
              erroInicial,
            );
          } catch (erroInicial) {
            console.error(
              "Erro inesperado ao criar o saldo inicial:",
              erroInicial,
            );
          }
        }
      }

      const saldoAtual = historicoPatrimonio.at(-1);
      const patrimonioGrafico = document.querySelector("#patrimonio-atual");
      const variacao = document.querySelector("#patrimonio-variacao");
      const saldoFormatado = saldoAtual
        ? dinheiro.format(Number(saldoAtual.valor_total))
        : "—";

      if (patrimonioGrafico) patrimonioGrafico.textContent = saldoFormatado;
      if (variacao) {
        variacao.textContent = saldoAtual
          ? `${historicoPatrimonio.length} registro(s) no histórico`
          : "Histórico ainda não registrado";
      }

      atualizarGraficoPatrimonio();
      atualizarRendimentoMensal(comMovimentacoes);
    }

    function limparHistoricoPatrimonio() {
      historicoPatrimonio = [];
      const patrimonioGrafico = document.querySelector("#patrimonio-atual");
      const variacao = document.querySelector("#patrimonio-variacao");
      const rendimento = document.querySelector("#monthly-return");
      const statusRendimento = document.querySelector("#monthly-return-status");

      if (patrimonioGrafico) patrimonioGrafico.textContent = "—";
      if (variacao) variacao.textContent = "Histórico ainda não registrado";
      if (rendimento) rendimento.textContent = "—";
      if (statusRendimento) statusRendimento.textContent = "Entre para consultar o rendimento";
      atualizarGraficoPatrimonio();
    }

    function lerValorMonetario(texto) {
      const valor = String(texto)
        .trim()
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=.*[,])/g, "")
        .replace(",", ".");
      return valor ? Number(valor) : NaN;
    }

    async function registrarSaldo() {
      if (!clienteSupabase || !usuarioAtual) {
        mensagem("Entre na sua conta para registrar o saldo.", "erro");
        return;
      }

      const patrimonioAtual = investimentos.reduce((total, item) => {
        const valor = Number(item.valor_investido);
        return total + (Number.isFinite(valor) ? valor : 0);
      }, 0);
      const saldoPadrao = patrimonioAtual.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const saldoTexto = window.prompt(
        "Informe o saldo total atual da carteira (R$):",
        saldoPadrao,
      );
      if (saldoTexto === null) return;
      const valorTotal = lerValorMonetario(saldoTexto);
      if (!Number.isFinite(valorTotal) || valorTotal < 0) {
        mensagem("Informe um saldo válido, igual ou maior que zero.", "erro");
        return;
      }

      const fluxoTexto = window.prompt(
        "Informe aportes menos resgates desde o saldo anterior (R$). Ex.: 5,00 de aporte ou -2,00 de resgate; 0 se não houve movimentação:",
        "0,00",
      );
      if (fluxoTexto === null) return;
      const movimentacaoLiquida = lerValorMonetario(fluxoTexto);
      if (!Number.isFinite(movimentacaoLiquida)) {
        mensagem("Informe um valor válido para aportes menos resgates.", "erro");
        return;
      }

      const agora = new Date();
      const dataReferencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

      let error;
      try {
        const registroExiste = historicoPatrimonio.some(
          (item) => item.data_referencia === dataReferencia,
        );

        if (registroExiste) {
          const atualizacao = {
            valor_total: valorTotal,
          };

          if (suporteMovimentacoes) {
            atualizacao.movimentacao_liquida = movimentacaoLiquida;
          }

          ({ error } = await clienteSupabase
            .from("historico_patrimonio")
            .update(atualizacao)
            .eq("user_id", usuarioAtual.id)
            .eq("data_referencia", dataReferencia));
        } else {
          const novoRegistro = {
            user_id: usuarioAtual.id,
            data_referencia: dataReferencia,
            valor_total: valorTotal,
          };

          if (suporteMovimentacoes) {
            novoRegistro.movimentacao_liquida = movimentacaoLiquida;
          }

          ({ error } = await clienteSupabase
            .from("historico_patrimonio")
            .insert(novoRegistro));
        }
      } catch (erro) {
        console.error("Erro ao registrar saldo e movimentações:", erro);
        mensagem("Não foi possível registrar o saldo. Tente novamente.", "erro");
        return;
      }

      if (error) {
        console.error("Erro ao registrar saldo e movimentações:", error);
        mensagem(
          "Não foi possível atualizar o histórico. Execute a migração do Supabase e confira as políticas RLS de INSERT/UPDATE.",
          "erro",
        );
        return;
      }

      await carregarHistoricoPatrimonio();
      mensagem("Saldo atualizado.");
    }
    // Atualizar tabela com dados reais
    // -----------------------------------------------------

    // -----------------------------------------------------
    // Atualizar gráfico com a distribuição real da carteira
    // -----------------------------------------------------

    function atualizarTabela() {
      if (!tabela) return;

      window.verticeInvestimentos = investimentos;
      const patrimonioAtual = investimentos.reduce((total, item) => {
        const valor = Number(item.valor_investido);
        return total + (Number.isFinite(valor) ? valor : 0);
      }, 0);

      const patrimonioFormatado = usuarioAtual
        ? patrimonioAtual.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })
        : "—";
      const patrimonioTopo = document.getElementById("patrimonio");

      if (patrimonioTopo) {
        patrimonioTopo.textContent = patrimonioFormatado;
      }

      atualizarGraficoDistribuicao();

      tabela.innerHTML = "";

      investimentos.forEach((item) => {
        const linha = document.createElement("tr");

        const nome = escaparHTML(item.nome || "Sem nome");
        const instituicao = escaparHTML(
          item.instituicao || "Instituição não informada",
        );
        const tipo = escaparHTML(item.tipo || VAZIO);
        const letra = escaparHTML(
          String(item.tipo || item.nome || "?")
            .charAt(0)
            .toLocaleUpperCase("pt-BR"),
        );
        const corIcone = CORES_ICONE[item.tipo] || "green-bg";
        const valor = escaparHTML(valorBR(item.valor_investido));
        const rentabilidade = escaparHTML(rentabilidadeBR(item));
        const vencimento = escaparHTML(dataBR(item.data_vencimento));
        const situacao = situacaoDoInvestimento(item);
        const idItem = escaparHTML(item.id);

        linha.innerHTML = `
          <td>
            <div class="product-name">
              <span class="product-icon ${corIcone}">${letra}</span>
              <div>
                <strong>${nome}</strong>
                <small>${instituicao} · ${tipo}</small>
              </div>
            </div>
          </td>
          <td>${valor}</td>
          <td class="positive">${rentabilidade}</td>
          <td>${vencimento}</td>
          <td>
            <span class="status-pill ${situacao.classe}">${situacao.texto}</span>
            <button type="button" data-excluir="${idItem}"
                    aria-label="Excluir ${nome}"
                    style="margin-left:8px;padding:4px 10px;border:1px solid #ef4444;border-radius:8px;background:transparent;color:#fca5a5;font:inherit;font-size:12px;cursor:pointer">
              Excluir
            </button>
          </td>
        `;

        tabela.appendChild(linha);
      });

      const rodape = document.querySelector(".table-footer");

      if (rodape) {
        const textos = rodape.querySelectorAll("span");

        if (textos[0]) {
          textos[0].textContent = `${investimentos.length} investimento(s) cadastrado(s)`;
        }

        if (textos[1]) {
          textos[1].textContent = "Dados carregados da sua conta.";
        }
      }

      aplicarFiltro();
    }

    // -----------------------------------------------------
    // Carregar investimentos do Supabase
    // Devolve true se carregou, false se deu erro
    // -----------------------------------------------------

    async function carregarInvestimentos() {
      if (!clienteSupabase || !usuarioAtual) return false;

      if (tabela) {
        tabela.innerHTML = `
          <tr>
            <td colspan="5">Carregando investimentos...</td>
          </tr>
        `;
      }

      try {
        const { data, error } = await clienteSupabase
          .from("investimentos")
          .select("*")
          .eq("user_id", usuarioAtual.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Erro ao consultar investimentos:", error);
          if (tabela) {
            tabela.innerHTML = `
              <tr><td colspan="5">Falha ao carregar os investimentos. Tente novamente.</td></tr>
            `;
          }

          mensagem(
            "Não foi possível carregar os investimentos. Veja o console (F12).",
            "erro",
          );

          return false;
        }

        investimentos = Array.isArray(data) ? data : [];

        atualizarTabela();
        await carregarHistoricoPatrimonio();

        return true;
      } catch (erro) {
        console.error("Erro inesperado ao carregar:", erro);
        mensagem("Ocorreu um erro ao carregar os investimentos.", "erro");

        return false;
      }
    }

    // -----------------------------------------------------
    // Conectar ao Supabase
    // -----------------------------------------------------

    async function iniciarIntegracaoSupabase() {
      clienteSupabase = window.verticeSupabase;

      if (!clienteSupabase) {
        console.error(
          "Supabase não encontrado. Confira se supabase.js carrega antes de script.js.",
        );

        mensagem(
          "A conexão com o Supabase não foi encontrada. Confira os arquivos de configuração.",
          "erro",
        );

        return;
      }

      try {
        const { data } = await clienteSupabase.auth.getSession();

        usuarioAtual = data?.session?.user || null;

        if (usuarioAtual) {
          await carregarInvestimentos();
        } else {
          investimentos = [];
          atualizarTabela();
          limparHistoricoPatrimonio();
        }

        clienteSupabase.auth.onAuthStateChange((evento, sessao) => {
          usuarioAtual = sessao?.user || null;

          if (evento === "SIGNED_IN" && usuarioAtual) {
            // Evita iniciar chamadas Supabase dentro do callback de autenticação.
            setTimeout(() => carregarInvestimentos(), 0);
          }

          if (evento === "SIGNED_OUT") {
            investimentos = [];
            atualizarTabela();
            limparHistoricoPatrimonio();
          }
        });
      } catch (erro) {
        console.error("Falha ao iniciar Supabase:", erro);

        mensagem(
          "Não foi possível iniciar a conexão com o banco de dados.",
          "erro",
        );
      }
    }

    // -----------------------------------------------------
    // Excluir investimento
    // -----------------------------------------------------

    async function excluirInvestimento(id) {
      if (!clienteSupabase || !usuarioAtual) {
        mensagem("Sua sessão não foi identificada. Entre novamente.", "erro");
        return;
      }

      const item = investimentos.find((registro) => registro.id === id);
      const nome = item?.nome || "este investimento";

      if (!window.confirm(`Excluir "${nome}"? Isso não pode ser desfeito.`)) {
        return;
      }

      try {
        // O .select() devolve as linhas apagadas. Se vier vazio, o banco
        // não apagou nada (normalmente falta a política de DELETE).
        const { data, error } = await clienteSupabase
          .from("investimentos")
          .delete()
          .eq("id", id)
          .eq("user_id", usuarioAtual.id)
          .select();

        if (error) {
          console.error("Erro ao excluir investimento:", error);
          mensagem(`Não foi possível excluir: ${error.message}`, "erro");
          return;
        }

        if (!data || data.length === 0) {
          mensagem(
            "Nada foi excluído. Confira se a política de DELETE existe no Supabase.",
            "erro",
          );
          return;
        }

        const recarregou = await carregarInvestimentos();

        if (recarregou) {
          mensagem("Investimento excluído.");
        }
      } catch (erro) {
        console.error("Erro inesperado ao excluir:", erro);
        mensagem("Ocorreu um erro ao excluir o investimento.", "erro");
      }
    }

    function interpretarErroSupabase(erro) {
      const mensagemErro = String(erro?.message || "").toLowerCase();

      if (
        erro?.code === "42501" ||
        mensagemErro.includes("row-level security") ||
        mensagemErro.includes("permission denied")
      ) {
        return "O Supabase bloqueou a gravação por segurança. Precisamos conferir a política de INSERT da tabela investimentos. Não desative o RLS.";
      }

      if (
        mensagemErro.includes("instituicao") &&
        (mensagemErro.includes("column") ||
          mensagemErro.includes("schema cache"))
      ) {
        return "O nome da coluna da instituição no banco parece diferente de 'instituicao'. Precisamos conferir o nome exato no Supabase.";
      }

      if (
        mensagemErro.includes("does not exist") ||
        mensagemErro.includes("schema cache")
      ) {
        return "Uma tabela ou coluna não foi encontrada. Confira os nomes das colunas da tabela investimentos no Supabase.";
      }

      return `Não foi possível salvar: ${erro?.message || "erro desconhecido"}`;
    }

    // -----------------------------------------------------
    // Botão de cadastro
    // -----------------------------------------------------

    if (botaoNovo) {
      botaoNovo.addEventListener("click", () => {
        prepararFormulario();

        const modal = document.querySelector("#vertice-modal-investimento");

        if (modal?.abrir) {
          modal.abrir();
        }
      });
    }

    // -----------------------------------------------------
    // Exportar os investimentos reais para CSV
    // -----------------------------------------------------

    if (botaoExportar) {
      botaoExportar.addEventListener("click", () => {
        if (investimentos.length === 0) {
          mensagem("Não há investimentos cadastrados para exportar.");
          return;
        }

        const colunas = [
          ["nome", "Nome"],
          ["tipo", "Tipo"],
          ["instituicao", "Instituição"],
          ["valor_investido", "Valor investido"],
          ["taxa_percentual", "Taxa percentual"],
          ["indexador", "Indexador"],
          ["data_aplicacao", "Data da aplicação"],
          ["data_vencimento", "Data de vencimento"],
        ];

        const csv = [
          colunas.map((coluna) => coluna[1]).join(";"),
          ...investimentos.map((item) =>
            colunas
              .map(([chave]) => {
                let valor = item[chave] ?? "";

                if (chave === "valor_investido" && valor !== "") {
                  valor = Number(valor).toFixed(2).replace(".", ",");
                }

                valor = String(valor).replace(/"/g, '""');

                if (/^[\t\r\n ]*[=+\-@]/.test(valor)) {
                  valor = `'${valor}`;
                }

                return `"${valor}"`;
              })
              .join(";"),
          ),
        ].join("\r\n");

        const arquivo = new Blob(["\uFEFF", csv], {
          type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");

        link.href = url;
        link.download = "massu-investimentos.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        mensagem("Arquivo CSV exportado.");
      });
    }

    // -----------------------------------------------------
    // Pesquisa na tabela
    // -----------------------------------------------------

    if (campoPesquisa) {
      campoPesquisa.addEventListener("input", aplicarFiltro);
    }

    // -----------------------------------------------------
    // Cliques nos botões Excluir
    // -----------------------------------------------------

    if (tabela) {
      tabela.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-excluir]");

        if (!botao) return;

        excluirInvestimento(botao.dataset.excluir);
      });
    }

    // -----------------------------------------------------
    // Inicializar gráficos sem dados demonstrativos
    // -----------------------------------------------------

    document
      .querySelector("#period-filter")
      ?.addEventListener("change", atualizarGraficoPatrimonio);

    botaoRegistrarSaldo?.addEventListener("click", registrarSaldo);

    if (typeof Chart !== "undefined") {
      document.querySelectorAll("canvas").forEach((canvas) => {
        if (Chart.getChart(canvas)) return;

        const contexto = canvas.getContext("2d");
        if (!contexto) return;

        const tipo = canvas.dataset.chartType || "line";

        new Chart(contexto, {
          type: tipo,
          data: {
            labels: [],
            datasets: [
              {
                label:
                  tipo === "line"
                    ? "Evolução do patrimônio"
                    : "Valor investido",
                data: [],
                borderColor: "#60a5fa",
                backgroundColor:
                  tipo === "line"
                    ? "rgba(96,165,250,.15)"
                    : [
                        "#ea580c",
                        "#eab308",
                        "#2563eb",
                        "#dc2626",
                        "#7c3aed",
                        "#0891b2",
                        "#be123c",
                        "#16a34a",
                      ],
                borderWidth: 2,
                tension: 0.35,
                fill: tipo === "line",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: tipo !== "line",
              },
            },
          },
        });
      });
    }

    prepararFormulario();
    iniciarIntegracaoSupabase();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarAplicacao);
  } else {
    iniciarAplicacao();
  }
})();
