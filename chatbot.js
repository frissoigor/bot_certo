const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");

// Cria o cliente com suporte a sessão persistente
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./sessao", // pasta onde a sessão será armazenada
  }),
});

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "#";
  for (let i = 0; i < 9; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  code += "-";
  for (let i = 0; i < 5; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function salvarAtendimento(dados) {
  const caminhoArquivo = "atendimentos.json";
  if (!fs.existsSync(caminhoArquivo)) {
    fs.writeFileSync(caminhoArquivo, "[]");
  }
  try {
    const dadosAnteriores = JSON.parse(fs.readFileSync(caminhoArquivo));
    dadosAnteriores.push(dados);
    fs.writeFileSync(caminhoArquivo, JSON.stringify(dadosAnteriores, null, 2));
    console.log("✅ Atendimento salvo:", dados.nome);
  } catch (err) {
    console.error("❌ Erro ao salvar atendimento:", err);
  }
}

function estaDentroDoHorarioComercial() {
  const agora = new Date();
  const dia = agora.getDay();
  const hora = agora.getHours();
  const minuto = agora.getMinutes();
  const inicioExpediente = 8 * 60;
  const fimExpediente = 18 * 60;
  const horarioAtual = hora * 60 + minuto;
  const diaUtil = dia >= 1 && dia <= 5;
  return (
    diaUtil && horarioAtual >= inicioExpediente && horarioAtual <= fimExpediente
  );
}

client.on("qr", (qr) => {
  console.log("📲 Escaneie o QR Code abaixo para logar:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ Tudo certo! WhatsApp conectado.");
});

client.initialize();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const userCodes = {};

client.on("message", async (msg) => {
  if (!msg.from.endsWith("@c.us")) return;

  if (!estaDentroDoHorarioComercial()) {
    await client.sendMessage(
      msg.from,
      `⏰ Olá! Nosso atendimento funciona de *segunda a sexta, das 08h às 18h*.\n\nVocê pode nos enviar sua mensagem normalmente, e assim que estivermos online, retornaremos o contato. Obrigado pela compreensão!`
    );
    return;
  }

  const chat = await msg.getChat();
  const contact = await msg.getContact();

  const user = userCodes[msg.from] || {};
  const name = user.name || contact.pushname || "Cliente";

  if (
    !userCodes[msg.from] &&
    msg.body.match(/(menu|dia|tarde|noite|oi|olá|ola)/i)
  ) {
    await delay(3000);
    await chat.sendStateTyping();
    await delay(3000);
    await client.sendMessage(
      msg.from,
      `👋 Olá! Seja bem-vindo(a) ao atendimento da Igor Frisso Consultoria e Tecnologia.\n\nPara melhor atendê-lo(a), poderia me informar seu **nome completo**?\n\n_Lembrando que nosso atendimento é com segurança e sigilo total_`
    );
    userCodes[msg.from] = { step: "awaiting_name" };
    return;
  }

  if (user.step === "awaiting_name") {
    const providedName = msg.body.trim().split(" ")[0];
    userCodes[msg.from] = {
      ...user,
      name: providedName,
      step: "menu",
      code: generateCode(),
    };
    await delay(3000);
    await chat.sendStateTyping();
    await delay(3000);
    await client.sendMessage(
      msg.from,
      `Olá, ${providedName}! Como posso ajudá-lo(a) hoje?\n\nDigite uma das opções abaixo:\n\n1⃣ Consultoria\n2⃣ Suporte Técnico\n3⃣ Orçamento / Proposta Comercial\n4⃣ Outro`
    );
    return;
  }

  if (user.step === "suporte_orgao") {
    userCodes[msg.from] = {
      ...user,
      orgao: msg.body.trim().toUpperCase(),
      step: "suporte_sistema",
    };
    await delay(3000);
    await chat.sendStateTyping();
    await delay(3000);
    await client.sendMessage(
      msg.from,
      `⚠️ *SELECIONE O SISTEMA ENVOLVIDO:*\n\n1⃣ - Compras, Licitações e Contratos\n2⃣ - Almoxarifado\n3⃣ - Patrimônio\n4⃣ - Frotas\n5⃣ - Protocolo e Processos`
    );
    return;
  }

  if (user.step === "suporte_sistema") {
    const sistemas = {
      1: "Compras, Licitações e Contratos",
      2: "Almoxarifado",
      3: "Patrimônio",
      4: "Frotas",
      5: "Protocolo e Processos",
    };
    const sistemaSelecionado = sistemas[msg.body.trim()];
    if (sistemaSelecionado) {
      userCodes[msg.from] = {
        ...user,
        sistema: sistemaSelecionado,
        step: "suporte_detalhes",
      };
      await delay(3000);
      await chat.sendStateTyping();
      await delay(3000);
      await client.sendMessage(
        msg.from,
        `📌 *DETALHES DO CHAMADO*\n\n🆔*Código do Atendimento:*: ${user.code}\n🏧 *Órgão:* ${user.orgao}\n⚙️ *Sistema:* ${sistemaSelecionado}\n\nPor favor, descreva detalhadamente o problema:\n\n🔹 O que está ocorrendo?\n🔹 Quando começou o problema?\n🔹 Há alguma mensagem de erro específica?\n🔹 Qual a urgência? (Baixa/Média/Alta/Crítica)\n\n📎 Você pode enviar imagens ou documentos se necessário.\n\n🟢 *Nossa equipe já foi acionada e entrará em contato em breve.*`
      );
    } else {
      await client.sendMessage(
        msg.from,
        `⚠️ Número inválido. Digite um número entre 1 e 5.`
      );
    }
    return;
  }

  if (user.step === "suporte_detalhes") {
    const dateTime = new Date().toLocaleString("pt-BR");
    await client.sendMessage(
      msg.from,
      `✅ *CHAMADO REGISTRADO!*\n\n🆔*Código do Atendimento:*: ${user.code}\n📅 ${dateTime}\n\n🟢 *Nossa equipe já foi acionada e entrará em contato em breve.*`
    );
    salvarAtendimento({
      nome: user.name,
      orgao: user.orgao,
      servico: user.sistema,
      id: user.code,
      data_hora: dateTime,
    });
    delete userCodes[msg.from];
    return;
  }

  if (user.step === "consultoria_municipio") {
    userCodes[msg.from] = {
      ...user,
      orgao: msg.body.trim().toUpperCase(),
      step: "consultoria_servico",
    };
    await client.sendMessage(
      msg.from,
      `🔹 *Gestão de Materiais e Patrimônio* – Controle de estoques, almoxarifados e bens públicos com rastreabilidade e redução de desperdícios.\n` +
        `🔹 *Processos Licitatórios e Contratos* – Assessoria em editais, fiscalização e acompanhamento de contratos para maior transparência.\n` +
        `🔹 *Prestação de Contas e Relatórios* – Elaboração e envio de prestações de contas (SICOM e CIDADES).\n` +
        `🔹 *Capacitação de Servidores* – Treinamentos para equipes em ferramentas de gestão e normas.\n\n` +
        `Qual serviço mais te interessa?\n1⃣ Gestão de Materiais e Patrimônio\n2⃣ Processos Licitatórios\n3⃣ Prestação de Contas\n4⃣ Capacitação`
    );
    return;
  }

  if (user.step === "consultoria_servico") {
    const servicos = {
      1: "Gestão de Materiais e Patrimônio",
      2: "Processos Licitatórios",
      3: "Prestação de Contas",
      4: "Capacitação",
    };
    const servicoSelecionado = servicos[msg.body.trim()];
    if (servicoSelecionado) {
      const dateTime = new Date().toLocaleString("pt-BR");
      await client.sendMessage(
        msg.from,
        `✅ *ATENDIMENTO REGISTRADO!*\n\n🆔*Código do Atendimento:* ${user.code}\n🏧 ${user.orgao}\n🌟 *Opção selecionada:* _${servicoSelecionado}_\n📅 ${dateTime}\n\n🟢 *Nossa equipe já foi acionada e entrará em contato em breve.*`
      );
      salvarAtendimento({
        nome: user.name,
        orgao: user.orgao,
        servico: servicoSelecionado,
        id: user.code,
        data_hora: dateTime,
      });
      delete userCodes[msg.from];
    } else {
      await client.sendMessage(
        msg.from,
        `⚠️ Número inválido. Digite entre 1 e 4.`
      );
    }
    return;
  }

  if (user.step === "orcamento_detalhes") {
    const dateTime = new Date().toLocaleString("pt-BR");
    await client.sendMessage(
      msg.from,
      `✅ *SOLICITAÇÃO DE ORÇAMENTO REGISTRADA!*\n🆔*Código do Atendimento:*: ${user.code}\n📅 ${dateTime}\n\n🟢 *Nossa equipe já foi acionada e entrará em contato em breve.*`
    );
    salvarAtendimento({
      nome: user.name,
      orgao: "-",
      servico: "Orçamento / Proposta Comercial",
      id: user.code,
      data_hora: dateTime,
    });
    delete userCodes[msg.from];
    return;
  }

  if (user.step === "outro") {
    const dateTime = new Date().toLocaleString("pt-BR");
    await client.sendMessage(
      msg.from,
      `✅ *SOLICITAÇÃO DE CONTATO REGISTRADA!*\n🆔*Código do Atendimento:*: ${user.code}\n📅 ${dateTime}\n\n🟢 *Nossa equipe já foi acionada e entrará em contato em breve.*`
    );
    salvarAtendimento({
      nome: user.name,
      orgao: "-",
      servico: "Outro",
      id: user.code,
      data_hora: dateTime,
    });
    delete userCodes[msg.from];
    return;
  }

  if (msg.body.match(/(menu|dia|tarde|noite|oi|olá|ola)/i)) {
    const code = generateCode();
    userCodes[msg.from] = { ...user, code, step: "menu" };
    await client.sendMessage(
      msg.from,
      `👋 Olá ${name}! Como posso ajudá-lo hoje?\n\n1⃣ Consultoria\n2⃣ Suporte Técnico\n3⃣ Orçamento\n4⃣ Outro`
    );
    return;
  }

  if (msg.body === "1") {
    userCodes[msg.from] = { ...user, step: "consultoria_municipio" };
    await client.sendMessage(
      msg.from,
      `💼 Consultoria\n\n1. Qual o nome do seu município ou órgão?`
    );
    return;
  }

  if (msg.body === "2") {
    userCodes[msg.from] = { ...user, step: "suporte_orgao" };
    await client.sendMessage(
      msg.from,
      `🗓 Suporte Técnico\n\nInforme o nome completo do órgão ou município:`
    );
    return;
  }

  if (msg.body === "3") {
    userCodes[msg.from] = { ...user, step: "orcamento_detalhes" };
    await client.sendMessage(
      msg.from,
      `🧾 Solicitação de Orçamento\nDescreva brevemente o que deseja orçar:`
    );
    return;
  }

  if (msg.body === "4") {
    userCodes[msg.from] = { ...user, step: "outro" };
    await client.sendMessage(
      msg.from,
      `📝 Descreva com mais detalhes como podemos ajudar:`
    );
    return;
  }
});
