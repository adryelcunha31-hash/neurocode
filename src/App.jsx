import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = "https://adifkeixdsxcmbpefpqv.supabase.co";
const SUPABASE_KEY = "sb_publishable_pYChTJWi50_I2ulbEhGplg_ld4ct57C";

const saveToSupabase = async (userData, analysis) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        nome: userData.name,
        email: userData.email,
        perfil: analysis.profile,
        risco: analysis.riskScore,
        disciplina: parseFloat(analysis.scores.discipline.toFixed(2)),
        frustracao: parseFloat(analysis.scores.frustration_tolerance.toFixed(2)),
        abstracao: parseFloat(analysis.scores.abstraction.toFixed(2)),
        raciocinio: parseFloat(analysis.scores.reasoning_depth.toFixed(2)),
        ego: parseFloat(analysis.scores.ego_control.toFixed(2)),
        autoconsciencia: parseFloat(analysis.scores.self_awareness.toFixed(2)),
        gargalo: analysis.bottleneck.name,
      })
    });
    if (!response.ok) {
      const err = await response.text();
      console.error("Supabase error:", err);
    }
  } catch (e) {
    console.error("Erro ao salvar:", e);
  }
};

// ============================================================
// COGNITIVE DIAGNOSTIC ENGINE
// ============================================================

const DIAGNOSTIC_QUESTIONS = [
  {
    id: "q1",
    category: "frustration_tolerance",
    text: "Você está há 3 horas tentando resolver um bug. Nada funciona. Descreva exatamente o que acontece na sua cabeça e o que você faz nesse momento.",
    minChars: 120,
    hint: "Seja específico sobre seus pensamentos e ações reais.",
    weight: { frustration: 0.9, discipline: 0.3, persistence: 0.6 }
  },
  {
    id: "q2",
    category: "effort_pattern",
    text: "Você prefere aprender um conceito completamente antes de praticar, ou pratica enquanto aprende? Por quê? Dê um exemplo real de como você aprendeu algo difícil.",
    minChars: 150,
    hint: "Relate uma experiência concreta de aprendizado.",
    weight: { learning_style: 0.9, abstraction: 0.4, discipline: 0.5 }
  },
  {
    id: "q3",
    category: "reasoning_pattern",
    text: "Quando você precisa resolver um problema que nunca enfrentou antes, qual é o seu processo mental passo a passo? O que você faz primeiro, segundo, terceiro?",
    minChars: 130,
    hint: "Descreva seu processo real, não o ideal.",
    weight: { abstraction: 0.8, reasoning: 0.9, discipline: 0.4 }
  },
  {
    id: "q4",
    category: "competence_illusion",
    text: "Você já achou que entendia algo profundamente, mas quando precisou aplicar ou explicar, percebeu que não entendia? O que descobriu sobre si mesmo nesse momento?",
    minChars: 140,
    hint: "Honestidade é fundamental aqui. Não existe resposta certa.",
    weight: { ego: 0.9, self_awareness: 0.8, frustration: 0.3 }
  },
  {
    id: "q5",
    category: "ego_vs_learning",
    text: "Alguém mais novo ou menos experiente que você te corrigiu ou ensinou algo. Como você reagiu internamente? O que isso diz sobre você?",
    minChars: 120,
    hint: "Seja brutal consigo mesmo. Seus padrões reais importam.",
    weight: { ego: 0.95, self_awareness: 0.7, learning_style: 0.3 }
  },
  {
    id: "q6",
    category: "persistence",
    text: "Descreva a tarefa mais difícil que você desistiu e a mais difícil que você concluiu. O que fez a diferença entre desistir e persistir?",
    minChars: 160,
    hint: "Compare os dois casos com detalhes reais.",
    weight: { persistence: 0.95, frustration: 0.6, discipline: 0.7 }
  },
  {
    id: "q7",
    category: "abstraction",
    text: "Explique com suas próprias palavras o que é uma função recursiva como se estivesse ensinando alguém que nunca programou. Depois diga se achou fácil ou difícil explicar e por quê.",
    minChars: 150,
    hint: "Use analogias se quiser. O processo de explicar revela seu nível de compreensão.",
    weight: { abstraction: 0.95, reasoning: 0.7, ego: 0.2 }
  },
  {
    id: "q8",
    category: "mental_organization",
    text: "Quando você está aprendendo algo novo e complexo, como você organiza as informações na sua cabeça? Você usa algum sistema? O que acontece quando tem muita coisa ao mesmo tempo?",
    minChars: 130,
    hint: "Descreva seu sistema real, incluindo quando ele falha.",
    weight: { discipline: 0.8, abstraction: 0.6, learning_style: 0.7 }
  }
];

// ============================================================
// COGNITIVE ANALYSIS ENGINE
// ============================================================

const analyzeResponses = (responses) => {
  const scores = {
    frustration_tolerance: 0,
    discipline: 0,
    abstraction: 0,
    persistence: 0,
    ego_control: 0,
    self_awareness: 0,
    reasoning_depth: 0,
    learning_efficiency: 0,
  };

  const patterns = {
    gives_up_language: /desist|abandon|largu|paro de|não consig|impossív|odeio|canso|chato/gi,
    resilient_language: /continuo|insist|resolv|persistência|nunca desist|busco|analiso|estratégi/gi,
    ego_markers: /sempre soub|claro que|óbvio|fácil pra mim|aprend rápido|naturalmen|ninguém me|sou bom/gi,
    humility_markers: /reconheç|percebi que|aprend com|me engan|estava errad|admito|dificuldade|honestamente/gi,
    shallow_reasoning: /não sei|talvez|acho que|depende|qualquer coisa|tanto faz|normal/gi,
    deep_reasoning: /porque|portanto|consequentemente|analiso|estruturo|divido|padrão|relacion|implica/gi,
    abstract_thinking: /conceito|analogia|abstrat|princípio|fundament|lógica|estrutura|modelo mental/gi,
    concrete_thinking: /exemplo|código|na prática|funciona|testei|vi|fiz|resultado/gi,
    structured_learning: /passo a passo|primeiro|segundo|sistema|método|processo|lista|organizo/gi,
    chaotic_learning: /tudo ao mesmo|misturad|confuso|desorganizad|sem ordem|aleatório/gi,
  };

  let totalResponses = responses.length;
  let responseDetails = [];

  responses.forEach((r) => {
    const text = r.answer.toLowerCase();
    const wordCount = r.answer.split(/\s+/).length;
    const charCount = r.answer.length;

    const detail = {
      category: r.category,
      wordCount,
      charCount,
      scores: {}
    };

    // Length & depth analysis
    const depthScore = Math.min(10, (charCount / 50));
    detail.scores.depth = depthScore;

    // Pattern matching
    const givenUp = (text.match(patterns.gives_up_language) || []).length;
    const resilient = (text.match(patterns.resilient_language) || []).length;
    const egoMarkers = (text.match(patterns.ego_markers) || []).length;
    const humility = (text.match(patterns.humility_markers) || []).length;
    const shallowReasoning = (text.match(patterns.shallow_reasoning) || []).length;
    const deepReasoning = (text.match(patterns.deep_reasoning) || []).length;
    const abstractCount = (text.match(patterns.abstract_thinking) || []).length;
    const concreteCount = (text.match(patterns.concrete_thinking) || []).length;
    const structured = (text.match(patterns.structured_learning) || []).length;
    const chaotic = (text.match(patterns.chaotic_learning) || []).length;

    detail.scores.resilience = Math.max(0, (resilient - givenUp) * 1.5 + 5);
    detail.scores.ego_control = Math.max(0, Math.min(10, (humility - egoMarkers) * 2 + 5));
    detail.scores.reasoning = Math.max(0, Math.min(10, (deepReasoning - shallowReasoning) * 1.2 + 5));
    detail.scores.abstraction = Math.min(10, abstractCount * 1.5 + concreteCount * 0.5);
    detail.scores.structure = Math.max(0, Math.min(10, (structured - chaotic) * 1.5 + 5));

    responseDetails.push(detail);
  });

  // Aggregate scores
  responseDetails.forEach(d => {
    scores.frustration_tolerance += d.scores.resilience / totalResponses;
    scores.ego_control += d.scores.ego_control / totalResponses;
    scores.reasoning_depth += d.scores.reasoning / totalResponses;
    scores.abstraction += d.scores.abstraction / totalResponses;
    scores.discipline += d.scores.structure / totalResponses;
    scores.self_awareness += d.scores.depth / totalResponses;
  });

  // Normalize to 0-10
  Object.keys(scores).forEach(k => {
    scores[k] = Math.max(1, Math.min(10, scores[k]));
  });

  // Calculate composite scores
  scores.persistence = (scores.frustration_tolerance * 0.6 + scores.discipline * 0.4);
  scores.learning_efficiency = (scores.reasoning_depth * 0.4 + scores.abstraction * 0.3 + scores.discipline * 0.3);

  // Determine profile
  const profile = determineProfile(scores);

  // Find critical weakness
  const weaknessKey = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
  const bottleneck = BOTTLENECK_MAP[weaknessKey] || BOTTLENECK_MAP.default;

  // Risk calculation
  const riskScore = calculateRisk(scores);

  return {
    scores,
    profile,
    bottleneck,
    riskScore,
    responseDetails
  };
};

const BOTTLENECK_MAP = {
  frustration_tolerance: {
    name: "Intolerância à Frustração",
    description: "Você abandona problemas antes de extrair o aprendizado deles. A dificuldade é confundida com impossibilidade.",
    impact: "Crítico — impede evolução em debugging e problemas complexos."
  },
  ego_control: {
    name: "Ego Cognitivo Elevado",
    description: "Resistência a aceitar que não sabe. Cria ilusões de competência que bloqueiam aprendizado real.",
    impact: "Alto — contamina toda a curva de aprendizado."
  },
  abstraction: {
    name: "Déficit de Abstração",
    description: "Dificuldade em separar o princípio do exemplo concreto. Memoriza sem compreender.",
    impact: "Crítico — sem abstração, cada problema novo parece inédito."
  },
  discipline: {
    name: "Baixa Disciplina Estrutural",
    description: "Aprendizado caótico e sem sistema. Acumula lacunas sem perceber.",
    impact: "Alto — gera conhecimento fragmentado e frágil."
  },
  reasoning_depth: {
    name: "Raciocínio Superficial",
    description: "Aceita a primeira resposta que funciona sem entender por quê. Resolve sintomas, não causas.",
    impact: "Alto — limita capacidade de criar soluções originais."
  },
  default: {
    name: "Consistência sob Pressão",
    description: "Performance oscila dependendo do contexto e nível de dificuldade.",
    impact: "Moderado — instabilidade no processo de resolução de problemas."
  }
};

const PROFILES = {
  "Analítico-Estrutural": {
    icon: "⬡",
    color: "#00D4FF",
    description: "Você pensa em sistemas. Precisa entender a estrutura completa antes de agir. Altamente eficiente em problemas bem definidos.",
    strengths: ["Organização lógica natural", "Excelente em debugging sistemático", "Alta capacidade de abstração"],
    weaknesses: ["Paralisia por análise", "Dificuldade com ambiguidade", "Perfeccionismo que bloqueia progresso"],
    learning_style: "estruturado",
    pace: "moderado-profundo",
    exercise_type: "problemas com estrutura clara e progressão definida"
  },
  "Executor-Prático": {
    icon: "▶",
    color: "#00FF94",
    description: "Você aprende fazendo. Teoria sem prática não entra. Alta produtividade quando há objetivos concretos.",
    strengths: ["Velocidade de implementação", "Aprende rápido com erros reais", "Alta tolerância à tentativa e erro"],
    weaknesses: ["Lacunas teóricas acumuladas", "Dificuldade com conceitos abstratos puros", "Soluções sem fundamento sólido"],
    learning_style: "hands-on",
    pace: "rápido-iterativo",
    exercise_type: "projetos reais com feedback imediato"
  },
  "Competitivo-Desafiador": {
    icon: "◆",
    color: "#FF6B35",
    description: "Performance é motivada por desafio e comparação. Excele sob pressão, mas pode colapsar sem estímulo externo.",
    strengths: ["Alta performance sob pressão", "Motivação intensa por objetivos", "Aprende rápido quando desafiado"],
    weaknesses: ["Ego interfere no aprendizado", "Desiste quando não há comparação", "Ignora fundamentos para avançar rápido"],
    learning_style: "desafiador-competitivo",
    pace: "rápido com marcos",
    exercise_type: "desafios progressivos e rankings"
  },
  "Criativo-Explorador": {
    icon: "◯",
    color: "#B06EFF",
    description: "Você aprende melhor quando explora conexões não óbvias. Odeia receitas prontas. Inovador mas inconsistente.",
    strengths: ["Pensamento lateral poderoso", "Cria soluções originais", "Alta adaptabilidade"],
    weaknesses: ["Falta de consistência e estrutura", "Abandona o que não é estimulante", "Lacunas graves em fundamentos"],
    learning_style: "exploratório",
    pace: "variável-intenso",
    exercise_type: "problemas abertos com múltiplas soluções válidas"
  },
  "Metódico-Progressivo": {
    icon: "▣",
    color: "#FFD93D",
    description: "Você progride devagar, mas solidamente. Alta retenção, baixo risco de colapso. O mais confiável dos perfis.",
    strengths: ["Consistência e confiabilidade", "Alta retenção de longo prazo", "Raramente cria lacunas"],
    weaknesses: ["Velocidade abaixo do necessário", "Dificuldade com mudanças bruscas", "Pode estagnar em zona de conforto"],
    learning_style: "progressivo-linear",
    pace: "lento-sólido",
    exercise_type: "progressão linear com repetição espaçada"
  }
};

const determineProfile = (scores) => {
  const profileScores = {
    "Analítico-Estrutural": scores.abstraction * 0.4 + scores.reasoning_depth * 0.4 + scores.discipline * 0.2,
    "Executor-Prático": scores.frustration_tolerance * 0.3 + scores.persistence * 0.4 + (10 - scores.abstraction) * 0.3,
    "Competitivo-Desafiador": (10 - scores.ego_control) * 0.5 + scores.persistence * 0.3 + scores.frustration_tolerance * 0.2,
    "Criativo-Explorador": (10 - scores.discipline) * 0.3 + scores.abstraction * 0.3 + scores.reasoning_depth * 0.4,
    "Metódico-Progressivo": scores.discipline * 0.5 + scores.self_awareness * 0.3 + scores.ego_control * 0.2,
  };

  return Object.entries(profileScores).sort((a, b) => b[1] - a[1])[0][0];
};

const calculateRisk = (scores) => {
  const riskFactors = [
    (10 - scores.frustration_tolerance) * 0.3,
    (10 - scores.persistence) * 0.25,
    (10 - scores.discipline) * 0.2,
    (10 - scores.ego_control) * 0.15,
    (10 - scores.self_awareness) * 0.1
  ];
  const raw = riskFactors.reduce((a, b) => a + b, 0);
  if (raw > 7) return "CRÍTICO";
  if (raw > 5) return "ALTO";
  if (raw > 3) return "MODERADO";
  return "BAIXO";
};

// ============================================================
// PROMPT GENERATOR ENGINE
// ============================================================

const generatePersonalizedPrompt = (userData, analysis) => {
  const { scores, profile, bottleneck, riskScore } = analysis;
  const profileData = PROFILES[profile];

  const riskInstructions = {
    "CRÍTICO": `ALERTA MÁXIMO: Este usuário tem risco CRÍTICO de desistência. Use reforço positivo a cada 15 minutos. Jamais deixe sem resposta por mais de 2 perguntas. Se detectar frustração, pause o conteúdo e trabalhe a mentalidade primeiro.`,
    "ALTO": `ATENÇÃO: Risco alto de abandono. Monitore sinais de frustração. Intercale teoria e prática a cada 20 minutos. Celebre pequenos avanços explicitamente.`,
    "MODERADO": `Monitore progresso. Se o usuário não responder por 10+ minutos em um exercício, ofereça dica direcionada sem dar a resposta.`,
    "BAIXO": `Usuário relativamente estável. Pode ser desafiado com problemas mais complexos após consolidação de cada conceito.`
  };

  const paceInstructions = {
    "estruturado": "Apresente SEMPRE a teoria completa do conceito antes de qualquer exercício. Use diagramas textuais quando possível.",
    "hands-on": "Apresente o conceito em no MÁXIMO 3 linhas, depois vá direto para um exercício prático. Teoria detalhada só se pedida.",
    "desafiador-competitivo": "Apresente desafios antes de explicar. Deixe o usuário tentar falhar primeiro, ENTÃO explique. Use linguagem de missão.",
    "exploratório": "Conecte cada conceito novo a algo que o usuário já conhece. Permita exploração lateral antes de corrigir o caminho.",
    "progressivo-linear": "Siga ordem ESTRITA: conceito → exemplo → exercício guiado → exercício autônomo → revisão. Nunca pule etapas."
  };

  const correctionStyle = {
    "Analítico-Estrutural": "Mostre ONDE a lógica quebrou, não apenas o que está errado. Use contra-exemplos.",
    "Executor-Prático": "Mostre como o código correto se comporta diferente. Use comparação direta de outputs.",
    "Competitivo-Desafiador": "Frame a correção como upgrade de habilidade: 'Isso funciona, mas um Sênior faria assim...'",
    "Criativo-Explorador": "Valide a criatividade da abordagem antes de mostrar o problema. Explore por que o raciocínio falhou.",
    "Metódico-Progressivo": "Corrija passo a passo, nunca tudo de uma vez. Um problema por vez."
  };

  const weaknessInstructions = {
    "frustration_tolerance": `
PROTOCOLO ANTI-FRUSTRAÇÃO ATIVO:
- Se o usuário disser 'não entendo', 'não consigo', 'não faz sentido' → PAUSE o conteúdo imediatamente
- Faça 1 pergunta: "O que exatamente travou?"
- Decomponha em peças menores até ele conseguir avançar
- Jamais diga "é simples" ou "é fácil"`,
    "ego_control": `
PROTOCOLO ANTI-EGO ATIVO:
- Quando o usuário afirmar entender algo, SEMPRE peça que explique com suas palavras
- Se a explicação for superficial, não confronte — faça uma pergunta que revele a lacuna
- Celebre quando ele admitir não saber: isso é maturidade cognitiva, não fraqueza`,
    "abstraction": `
PROTOCOLO ABSTRAÇÃO ATIVO:
- Nunca ensine apenas o exemplo. Sempre extraia o princípio: "O que este código está fazendo em nível lógico?"
- Após cada exercício, pergunte: "Como você usaria isso em um contexto completamente diferente?"
- Construa pontes entre conceitos obrigatoriamente`,
    "discipline": `
PROTOCOLO ESTRUTURA ATIVA:
- Sempre que apresentar exercício, dê estrutura explícita: "Passo 1... Passo 2... Passo 3..."
- Peça que o usuário verbalize o plano ANTES de codificar
- Se ele pular etapas, rewind gentil: "Antes de fazer X, o que você precisa garantir?"`,
    "reasoning_depth": `
PROTOCOLO RACIOCÍNIO PROFUNDO:
- Nunca aceite "funcionou!" como conclusão. Sempre pergunte "Por que funcionou?"
- Apresente variações do mesmo problema para testar se o entendimento é real
- Force o usuário a prever o resultado ANTES de executar`
  };

  const weaknessKey = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];

  const prompt = `# SISTEMA DE ENSINO PERSONALIZADO — NEUROCODE DIAGNOSIS
## IDENTIDADE DO APRENDIZ

**Nome:** ${userData.name}
**Perfil Cognitivo Dominante:** ${profile}
**Risco de Desistência:** ${riskScore}

---

## COMO ESTE USUÁRIO FUNCIONA (LEIA COM ATENÇÃO TOTAL)

${profileData.description}

**Pontos Fortes Reais:**
${profileData.strengths.map(s => `• ${s}`).join('\n')}

**Fraquezas Críticas Identificadas:**
${profileData.weaknesses.map(w => `• ${w}`).join('\n')}

**Gargalo Cognitivo Principal:** ${bottleneck.name}
${bottleneck.description}
Impacto: ${bottleneck.impact}

---

## SCORES COGNITIVOS (1-10)

• Tolerância à Frustração: ${scores.frustration_tolerance.toFixed(1)}/10
• Disciplina Estrutural: ${scores.discipline.toFixed(1)}/10
• Capacidade de Abstração: ${scores.abstraction.toFixed(1)}/10
• Profundidade de Raciocínio: ${scores.reasoning_depth.toFixed(1)}/10
• Controle do Ego: ${scores.ego_control.toFixed(1)}/10
• Autoconsciência: ${scores.self_awareness.toFixed(1)}/10
• Persistência: ${scores.persistence.toFixed(1)}/10

---

## INSTRUÇÕES DE ENSINO OBRIGATÓRIAS

### RITMO E CADÊNCIA
${paceInstructions[profileData.learning_style] || paceInstructions["progressivo-linear"]}
**Ritmo:** ${profileData.pace}
**Tipo de exercício preferencial:** ${profileData.exercise_type}

### GESTÃO DE RISCO
${riskInstructions[riskScore]}

### PROTOCOLO DE CORREÇÃO
${correctionStyle[profile]}

### PROTOCOLO ESPECIAL — GARGALO PRINCIPAL
${weaknessInstructions[weaknessKey] || weaknessInstructions.discipline}

---

## SEQUÊNCIA DE ENSINO OBRIGATÓRIA

### FASE 1 — LÓGICA DE PROGRAMAÇÃO (4-6 semanas)
Siga EXATAMENTE esta ordem. Não avance sem confirmação de domínio:

1. **Pensamento Algorítmico**
   - O que é um algoritmo (sem código)
   - Decomposição de problemas cotidianos
   - Exercício: Escrever algoritmo em português estruturado
   
2. **Variáveis e Tipos de Dado**
   - Conceito de memória e armazenamento
   - Tipos primitivos e por que existem
   - Exercício: Modelar situações reais com variáveis
   
3. **Operadores e Expressões**
   - Lógica booleana aplicada
   - Precedência e por que importa
   - Exercício: Prever resultados antes de executar
   
4. **Estruturas de Decisão**
   - Fluxo condicional como mapa de decisão
   - Aninhamento e suas consequências
   - Exercício: Diagramar fluxos antes de codificar
   
5. **Repetição e Laços**
   - Quando e por que repetir
   - While vs For: a diferença lógica
   - Exercício: Simular laços na mão antes de executar
   
6. **Funções e Modularização**
   - Princípio de responsabilidade única
   - Abstração como poder
   - Exercício: Decompor programa em funções antes de escrever
   
7. **Estruturas de Dados Básicas**
   - Arrays como coleções estruturadas
   - Busca e manipulação
   - Exercício: Resolver sem código primeiro

8. **Debugging e Raciocínio sob Erro**
   - Erro como informação, não falha
   - Processo sistemático de investigação
   - Exercício: Encontrar bugs propositais

### FASE 2 — JAVA (após domínio sólido de lógica)
Só inicie Java quando o usuário demonstrar:
✓ Capacidade de escrever algoritmo em pseudocódigo
✓ Entendimento real (não memorizado) de funções
✓ Capacidade de debuggar raciocínio próprio

Sequência Java:
1. Sintaxe básica e diferença de linguagem tipada
2. POO: Classes e Objetos (com analogias do mundo real)
3. Herança e Polimorfismo (construindo sobre lógica já dominada)
4. Coleções Java
5. Tratamento de exceções
6. Primeiro projeto real

---

## REGRAS ABSOLUTAS PARA ESTE USUÁRIO

1. NUNCA dê a resposta diretamente. Sempre guie até ela.
2. SEMPRE confirme entendimento antes de avançar.
3. JAMAIS use linguagem que minimize dificuldade ("é simples", "básico").
4. SEMPRE conecte conceito novo a algo já aprendido.
5. Se detectar estagnação (mesmo pergunta 2x), mude a abordagem completamente.
6. Ao final de cada sessão, faça o usuário resumir o que aprendeu com suas palavras.
7. ${riskScore === "CRÍTICO" || riskScore === "ALTO" ? "PRIORIZE confiança sobre velocidade. Um conceito bem entendido vale mais que dez mal assimilados." : "Mantenha desafio constante para evitar zona de conforto."}

---

## INÍCIO DA SESSÃO

Apresente-se brevemente e inicie com a Fase 1, Etapa 1 — Pensamento Algorítmico.
Use a abordagem: ${profileData.learning_style}.
Primeira pergunta ao usuário: "Antes de qualquer código, me diga: o que você acha que um computador realmente faz quando executa um programa?"

Esta pergunta revela nível de abstração atual e direciona a explicação inicial.`;

  return prompt;
};

// ============================================================
// UI COMPONENTS
// ============================================================

const ScoreBar = ({ label, value, color }) => {
  const [width, setWidth] = useState(0);
  
  useEffect(() => {
    setTimeout(() => setWidth(value * 10), 100);
  }, [value]);

  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ color: "#8892A4", fontSize: "12px", fontFamily: "'Space Mono', monospace" }}>{label}</span>
        <span style={{ color: color, fontSize: "12px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: "4px", background: "#1A2332", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${width}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: "2px",
          transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: `0 0 8px ${color}44`
        }} />
      </div>
    </div>
  );
};

const RiskBadge = ({ level }) => {
  const colors = {
    "CRÍTICO": { bg: "#FF1744", text: "#FFE0E6" },
    "ALTO": { bg: "#FF6B35", text: "#FFF0E8" },
    "MODERADO": { bg: "#FFD93D", text: "#1A1A00" },
    "BAIXO": { bg: "#00D4FF", text: "#001A2C" }
  };
  const c = colors[level] || colors["BAIXO"];
  return (
    <span style={{
      background: c.bg,
      color: c.text,
      padding: "2px 10px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 700,
      fontFamily: "'Space Mono', monospace",
      letterSpacing: "0.05em"
    }}>{level}</span>
  );
};

// ============================================================
// MAIN APP
// ============================================================

export default function NeuroCode() {
  const [phase, setPhase] = useState("landing"); // landing | form | diagnosis | analysis | results | prompt
  const [userData, setUserData] = useState({ name: "", email: "" });
  const [currentQ, setCurrentQ] = useState(0);
  const [responses, setResponses] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [fadeIn, setFadeIn] = useState(true);
  const textareaRef = useRef(null);
  const [formErrors, setFormErrors] = useState({});

  const progress = ((currentQ) / DIAGNOSTIC_QUESTIONS.length) * 100;
  const question = DIAGNOSTIC_QUESTIONS[currentQ];
  const minChars = question?.minChars || 100;
  const isValid = charCount >= minChars;

  const transition = (newPhase) => {
    setFadeIn(false);
    setTimeout(() => {
      setPhase(newPhase);
      setFadeIn(true);
    }, 300);
  };

  const handleAnswerChange = (e) => {
    setCurrentAnswer(e.target.value);
    setCharCount(e.target.value.length);
  };

  const handleNext = () => {
    if (!isValid) return;
    const newResponses = [...responses, {
      category: question.category,
      question: question.text,
      answer: currentAnswer,
      questionId: question.id
    }];
    setResponses(newResponses);
    setCurrentAnswer("");
    setCharCount(0);

    if (currentQ + 1 < DIAGNOSTIC_QUESTIONS.length) {
      setFadeIn(false);
      setTimeout(() => {
        setCurrentQ(currentQ + 1);
        setFadeIn(true);
      }, 300);
    } else {
      transition("analysis");
      setTimeout(() => {
        const result = analyzeResponses(newResponses);
        const prompt = generatePersonalizedPrompt(userData, result);
        setAnalysis(result);
        setGeneratedPrompt(prompt);
        saveToSupabase(userData, result);
        setTimeout(() => transition("results"), 2000);
      }, 500);
    }
  };

  const handleStartDiagnosis = () => {
    const errors = {};
    if (!userData.name.trim()) errors.name = "Nome é obrigatório";
    if (!userData.email.trim() || !userData.email.includes("@")) errors.email = "Email inválido";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    transition("diagnosis");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const profileData = analysis ? PROFILES[analysis.profile] : null;

  // ---- CSS ----
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body { 
      background: #080D14; 
      color: #E2E8F0;
      font-family: 'Syne', sans-serif;
      min-height: 100vh;
      display: flex;
      justify-content: center;
    }

    .nc-root {
      background: #080D14;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .nc-fade {
      opacity: ${fadeIn ? 1 : 0};
      transition: opacity 0.3s ease;
    }

    .nc-landing {
      max-width: 680px;
      width: 100%;
      padding: 80px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .nc-logo {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.3em;
      color: #00D4FF;
      margin-bottom: 48px;
      text-transform: uppercase;
    }

    .nc-title {
      font-family: 'Syne', sans-serif;
      font-size: clamp(42px, 8vw, 72px);
      font-weight: 800;
      line-height: 1.05;
      color: #E2E8F0;
      margin-bottom: 8px;
    }

    .nc-title span {
      color: #00D4FF;
    }

    .nc-subtitle {
      font-size: 16px;
      color: #8892A4;
      line-height: 1.7;
      margin-bottom: 56px;
      max-width: 520px;
    }

    .nc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      width: 100%;
      margin-bottom: 48px;
    }

    .nc-feature {
      background: #0D1520;
      border: 1px solid #1A2332;
      border-radius: 8px;
      padding: 16px;
      text-align: left;
    }

    .nc-feature-icon {
      font-size: 20px;
      margin-bottom: 8px;
    }

    .nc-feature-title {
      font-size: 13px;
      font-weight: 700;
      color: #E2E8F0;
      margin-bottom: 4px;
    }

    .nc-feature-desc {
      font-size: 12px;
      color: #8892A4;
      line-height: 1.5;
    }

    .nc-btn {
      background: #00D4FF;
      color: #080D14;
      border: none;
      padding: 16px 48px;
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      border-radius: 6px;
      text-transform: uppercase;
      transition: all 0.2s;
    }

    .nc-btn:hover { background: #33DDFF; transform: translateY(-1px); }
    .nc-btn:active { transform: translateY(0); }

    .nc-btn-secondary {
      background: transparent;
      color: #00D4FF;
      border: 1px solid #00D4FF44;
      padding: 14px 32px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      cursor: pointer;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      transition: all 0.2s;
    }

    .nc-btn-secondary:hover { border-color: #00D4FF; background: #00D4FF11; }

    .nc-form {
      max-width: 560px;
      width: 100%;
      padding: 80px 24px;
    }

    .nc-form-title {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .nc-form-sub {
      color: #8892A4;
      font-size: 14px;
      margin-bottom: 48px;
      line-height: 1.6;
    }

    .nc-field {
      margin-bottom: 24px;
    }

    .nc-label {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: #00D4FF;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      display: block;
      margin-bottom: 8px;
    }

    .nc-input {
      width: 100%;
      background: #0D1520;
      border: 1px solid #1A2332;
      border-radius: 6px;
      padding: 14px 16px;
      color: #E2E8F0;
      font-family: 'Syne', sans-serif;
      font-size: 16px;
      outline: none;
      transition: border-color 0.2s;
    }

    .nc-input:focus { border-color: #00D4FF44; }
    .nc-input.error { border-color: #FF1744; }

    .nc-error {
      color: #FF6B6B;
      font-size: 12px;
      margin-top: 4px;
      font-family: 'Space Mono', monospace;
    }

    .nc-diag {
      max-width: 720px;
      width: 100%;
      padding: 48px 24px 80px;
    }

    .nc-progress-bar {
      height: 2px;
      background: #1A2332;
      border-radius: 1px;
      margin-bottom: 48px;
      overflow: hidden;
    }

    .nc-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00D4FF, #B06EFF);
      border-radius: 1px;
      transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .nc-q-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
    }

    .nc-q-cat {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: #B06EFF;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      background: #B06EFF11;
      border: 1px solid #B06EFF22;
      padding: 4px 10px;
      border-radius: 4px;
    }

    .nc-q-num {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: #8892A4;
    }

    .nc-question {
      font-size: clamp(20px, 3vw, 26px);
      font-weight: 700;
      line-height: 1.4;
      margin-bottom: 12px;
      color: #E2E8F0;
    }

    .nc-hint {
      font-size: 13px;
      color: #8892A4;
      margin-bottom: 24px;
      font-style: italic;
    }

    .nc-textarea {
      width: 100%;
      background: #0D1520;
      border: 1px solid #1A2332;
      border-radius: 8px;
      padding: 16px;
      color: #E2E8F0;
      font-family: 'Syne', sans-serif;
      font-size: 15px;
      line-height: 1.7;
      resize: vertical;
      min-height: 180px;
      outline: none;
      transition: border-color 0.2s;
    }

    .nc-textarea:focus { border-color: #00D4FF22; }

    .nc-char-count {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }

    .nc-char-num {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
    }

    .nc-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
    }

    .nc-analysis {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 24px;
      padding: 48px 24px;
    }

    .nc-spinner {
      width: 48px;
      height: 48px;
      border: 2px solid #1A2332;
      border-top-color: #00D4FF;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .nc-analysis-text {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      color: #8892A4;
      letter-spacing: 0.1em;
    }

    .nc-results {
      max-width: 800px;
      width: 100%;
      padding: 48px 24px 80px;
    }

    .nc-results-header {
      margin-bottom: 48px;
    }

    .nc-profile-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    .nc-section {
      background: #0D1520;
      border: 1px solid #1A2332;
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 16px;
    }

    .nc-section-title {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #8892A4;
      margin-bottom: 16px;
    }

    .nc-tag {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      margin: 3px;
    }

    .nc-bottleneck {
      background: #FF1744;
      border: 1px solid #FF174422;
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 16px;
    }

    .nc-bottleneck-title {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #FF6B6B;
      margin-bottom: 8px;
    }

    .nc-cta {
      text-align: center;
      margin-top: 48px;
      padding: 40px 24px;
      background: #0D1520;
      border: 1px solid #00D4FF22;
      border-radius: 12px;
    }

    .nc-cta-title {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .nc-cta-sub {
      color: #8892A4;
      font-size: 14px;
      margin-bottom: 24px;
    }

    .nc-prompt-view {
      max-width: 800px;
      width: 100%;
      padding: 48px 24px 80px;
    }

    .nc-prompt-box {
      background: #0D1520;
      border: 1px solid #1A2332;
      border-radius: 10px;
      padding: 24px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      line-height: 1.8;
      color: #C5CDD8;
      white-space: pre-wrap;
      max-height: 600px;
      overflow-y: auto;
      margin-bottom: 24px;
    }

    .nc-prompt-box::-webkit-scrollbar { width: 4px; }
    .nc-prompt-box::-webkit-scrollbar-track { background: #0D1520; }
    .nc-prompt-box::-webkit-scrollbar-thumb { background: #1A2332; border-radius: 2px; }

    @media (max-width: 640px) {
      .nc-grid { grid-template-columns: 1fr; }
    }
  `;

  return (
    <>
      <style>{css}</style>
      <div className="nc-root">
        <div className={`nc-fade`} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>

          {/* ---- LANDING ---- */}
          {phase === "landing" && (
            <div className="nc-landing">
              <div className="nc-logo">NeuroCode System v1.0</div>
              <h1 className="nc-title">Diagnóstico<br /><span>Cognitivo</span><br />Real.</h1>
              <p className="nc-subtitle">Não é um quiz. É um sistema de análise que detecta como você pensa, onde você falha e como deve aprender programação.</p>

              <div className="nc-grid">
                {[
                  { icon: "🧠", title: "8 Dimensões Cognitivas", desc: "Análise profunda de como você processa, aprende e reage a desafios" },
                  { icon: "⚡", title: "Detecção de Gargalos", desc: "Identifica o obstáculo específico que mais limita seu progresso" },
                  { icon: "🎯", title: "Perfil Dominante", desc: "Classifica seu modo de raciocínio entre 5 arquétipos cognitivos" },
                  { icon: "🤖", title: "Prompt Personalizado", desc: "Gera instrução completa para o Claude ensinar no seu ritmo e estilo" }
                ].map((f, i) => (
                  <div className="nc-feature" key={i}>
                    <div className="nc-feature-icon">{f.icon}</div>
                    <div className="nc-feature-title">{f.title}</div>
                    <div className="nc-feature-desc">{f.desc}</div>
                  </div>
                ))}
              </div>

              <button className="nc-btn" onClick={() => transition("form")}>
                Iniciar Diagnóstico →
              </button>
              <p style={{ color: "#8892A4", fontSize: "12px", marginTop: "16px", fontFamily: "'Space Mono', monospace" }}>
                ~15 minutos · 8 perguntas profundas
              </p>
            </div>
          )}

          {/* ---- FORM ---- */}
          {phase === "form" && (
            <div className="nc-form">
              <div style={{ marginBottom: "12px" }}>
                <button className="nc-btn-secondary" onClick={() => transition("landing")}>← Voltar</button>
              </div>
              <h2 className="nc-form-title">Antes de começar</h2>
              <p className="nc-form-sub">Suas respostas ficam vinculadas ao seu perfil. Seja completamente honesto — o sistema detecta padrões de autoproteção.</p>

              <div className="nc-field">
                <label className="nc-label">Seu nome</label>
                <input
                  className={`nc-input ${formErrors.name ? "error" : ""}`}
                  value={userData.name}
                  onChange={e => { setUserData({ ...userData, name: e.target.value }); setFormErrors({ ...formErrors, name: "" }); }}
                  placeholder="Como você quer ser chamado"
                />
                {formErrors.name && <div className="nc-error">{formErrors.name}</div>}
              </div>

              <div className="nc-field">
                <label className="nc-label">Seu email</label>
                <input
                  className={`nc-input ${formErrors.email ? "error" : ""}`}
                  type="email"
                  value={userData.email}
                  onChange={e => { setUserData({ ...userData, email: e.target.value }); setFormErrors({ ...formErrors, email: "" }); }}
                  placeholder="para@seu.email"
                />
                {formErrors.email && <div className="nc-error">{formErrors.email}</div>}
              </div>

              <div style={{ background: "#0D1520", border: "1px solid #1A2332", borderRadius: "8px", padding: "16px", marginBottom: "32px" }}>
                <p style={{ fontSize: "13px", color: "#8892A4", lineHeight: "1.6" }}>
                  <strong style={{ color: "#FFD93D" }}>Importante:</strong> Respostas curtas ou superficiais afetam a precisão do diagnóstico. O sistema exige mínimo de caracteres por resposta e detecta padrões de evasão.
                </p>
              </div>

              <button className="nc-btn" onClick={handleStartDiagnosis} style={{ width: "100%" }}>
                Confirmar e Iniciar
              </button>
            </div>
          )}

          {/* ---- DIAGNOSIS ---- */}
          {phase === "diagnosis" && question && (
            <div className="nc-diag">
              <div className="nc-progress-bar">
                <div className="nc-progress-fill" style={{ width: `${progress}%` }} />
              </div>

              <div className="nc-q-meta">
                <span className="nc-q-cat">{question.category.replace("_", " ")}</span>
                <span className="nc-q-num">{currentQ + 1} / {DIAGNOSTIC_QUESTIONS.length}</span>
              </div>

              <h2 className="nc-question">{question.text}</h2>
              <p className="nc-hint">💡 {question.hint}</p>

              <textarea
                ref={textareaRef}
                className="nc-textarea"
                value={currentAnswer}
                onChange={handleAnswerChange}
                placeholder="Escreva sua resposta aqui..."
                autoFocus
              />

              <div className="nc-char-count">
                <span className="nc-char-num" style={{ color: isValid ? "#00D4FF" : "#8892A4" }}>
                  {charCount}/{minChars} caracteres {isValid ? "✓" : `(mín. ${minChars})`}
                </span>
                <div style={{ width: "100px", height: "3px", background: "#1A2332", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, (charCount / minChars) * 100)}%`,
                    background: isValid ? "#00D4FF" : "#FFD93D",
                    transition: "width 0.3s, background 0.3s",
                    borderRadius: "2px"
                  }} />
                </div>
              </div>

              <div className="nc-actions">
                <button
                  className="nc-btn"
                  onClick={handleNext}
                  disabled={!isValid}
                  style={{ opacity: isValid ? 1 : 0.4, cursor: isValid ? "pointer" : "not-allowed" }}
                >
                  {currentQ + 1 < DIAGNOSTIC_QUESTIONS.length ? "Próxima →" : "Finalizar →"}
                </button>
              </div>
            </div>
          )}

          {/* ---- ANALYSIS ---- */}
          {phase === "analysis" && (
            <div className="nc-analysis">
              <div className="nc-spinner" />
              <div style={{ textAlign: "center" }}>
                <p className="nc-analysis-text">Processando padrões cognitivos...</p>
                <p style={{ color: "#8892A4", fontSize: "12px", marginTop: "8px" }}>Cruzando {responses.length} respostas · Detectando gargalos</p>
              </div>
            </div>
          )}

          {/* ---- RESULTS ---- */}
          {phase === "results" && analysis && profileData && (
            <div className="nc-results">
              <div className="nc-results-header">
                <div
                  className="nc-profile-badge"
                  style={{ background: `${profileData.color}18`, border: `1px solid ${profileData.color}44`, color: profileData.color }}
                >
                  <span style={{ fontSize: "18px" }}>{profileData.icon}</span>
                  {analysis.profile}
                </div>
                <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 800, marginBottom: "8px" }}>
                  Seu Diagnóstico, {userData.name.split(" ")[0]}
                </h1>
                <p style={{ color: "#8892A4", fontSize: "15px", lineHeight: "1.6", maxWidth: "600px" }}>
                  {profileData.description}
                </p>
              </div>

              {/* Scores */}
              <div className="nc-section">
                <div className="nc-section-title">Mapa Cognitivo</div>
                <ScoreBar label="Tolerância à Frustração" value={analysis.scores.frustration_tolerance} color="#00D4FF" />
                <ScoreBar label="Disciplina Estrutural" value={analysis.scores.discipline} color="#B06EFF" />
                <ScoreBar label="Capacidade de Abstração" value={analysis.scores.abstraction} color="#FFD93D" />
                <ScoreBar label="Profundidade de Raciocínio" value={analysis.scores.reasoning_depth} color="#00FF94" />
                <ScoreBar label="Controle do Ego" value={analysis.scores.ego_control} color="#FF6B35" />
                <ScoreBar label="Autoconsciência" value={analysis.scores.self_awareness} color="#00D4FF" />
              </div>

              {/* Risk + Profile */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div className="nc-section">
                  <div className="nc-section-title">Risco de Desistência</div>
                  <RiskBadge level={analysis.riskScore} />
                </div>
                <div className="nc-section">
                  <div className="nc-section-title">Estilo de Aprendizado</div>
                  <span style={{ fontSize: "14px", color: profileData.color, fontWeight: 700 }}>
                    {profileData.learning_style}
                  </span>
                </div>
              </div>

              {/* Strengths */}
              <div className="nc-section">
                <div className="nc-section-title">Pontos Fortes</div>
                {profileData.strengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                    <span style={{ color: "#00D4FF", marginTop: "2px" }}>↗</span>
                    <span style={{ fontSize: "14px", color: "#C5CDD8" }}>{s}</span>
                  </div>
                ))}
              </div>

              {/* Weaknesses */}
              <div className="nc-section">
                <div className="nc-section-title">Fraquezas Identificadas</div>
                {profileData.weaknesses.map((w, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                    <span style={{ color: "#FF6B35", marginTop: "2px" }}>↘</span>
                    <span style={{ fontSize: "14px", color: "#C5CDD8" }}>{w}</span>
                  </div>
                ))}
              </div>

              {/* Bottleneck */}
              <div style={{ background: "#FF174411", border: "1px solid #FF174433", borderRadius: "10px", padding: "24px", marginBottom: "16px" }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#FF6B6B", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "12px" }}>
                  ⚠ Gargalo Cognitivo Principal
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#FF6B6B", marginBottom: "8px" }}>{analysis.bottleneck.name}</h3>
                <p style={{ fontSize: "14px", color: "#C5CDD8", lineHeight: "1.6", marginBottom: "8px" }}>{analysis.bottleneck.description}</p>
                <p style={{ fontSize: "12px", color: "#FF9898", fontFamily: "'Space Mono', monospace" }}>Impacto: {analysis.bottleneck.impact}</p>
              </div>

              {/* Plan */}
              <div className="nc-section">
                <div className="nc-section-title">Plano de Evolução</div>
                {[
                  { phase: "Fase 1", title: "Lógica de Programação", duration: "4-6 semanas", color: "#00D4FF" },
                  { phase: "Fase 2", title: "Java — Fundamentos", duration: "6-8 semanas", color: "#B06EFF" },
                  { phase: "Fase 3", title: "Java — POO e Projetos", duration: "8+ semanas", color: "#FFD93D" }
                ].map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: "16px", marginBottom: "16px", alignItems: "flex-start" }}>
                    <div style={{ background: `${p.color}22`, border: `1px solid ${p.color}44`, borderRadius: "6px", padding: "6px 10px", minWidth: "70px", textAlign: "center" }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px", color: p.color }}>{p.phase}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#E2E8F0" }}>{p.title}</div>
                      <div style={{ fontSize: "12px", color: "#8892A4", fontFamily: "'Space Mono', monospace" }}>{p.duration}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="nc-cta">
                <h2 className="nc-cta-title">Pronto para começar?</h2>
                <p className="nc-cta-sub">Seu prompt personalizado foi gerado com base em todo o diagnóstico. Use no Claude para iniciar o treinamento calibrado para você.</p>
                <button className="nc-btn" onClick={() => transition("prompt")}>
                  Ver Prompt e Iniciar Treinamento →
                </button>
              </div>
            </div>
          )}

          {/* ---- PROMPT ---- */}
          {phase === "prompt" && (
            <div className="nc-prompt-view">
              <button className="nc-btn-secondary" onClick={() => transition("results")} style={{ marginBottom: "32px" }}>
                ← Voltar ao Resultado
              </button>
              <h2 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "8px" }}>Seu Prompt Personalizado</h2>
              <p style={{ color: "#8892A4", fontSize: "14px", marginBottom: "32px", lineHeight: "1.6" }}>
                Cole este prompt em uma nova conversa no Claude. Ele instrui o modelo sobre como você aprende, suas fraquezas e o ritmo ideal de ensino.
              </p>

              <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                <button className="nc-btn" onClick={handleCopy}>
                  {copied ? "✓ Copiado!" : "Copiar Prompt"}
                </button>
                <a
                  href={`https://claude.ai/new?q=${encodeURIComponent(generatedPrompt.substring(0, 2000))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <button className="nc-btn-secondary">Abrir no Claude →</button>
                </a>
              </div>

              <div className="nc-prompt-box">{generatedPrompt}</div>

              <div style={{ background: "#0D1520", border: "1px solid #1A2332", borderRadius: "8px", padding: "16px" }}>
                <p style={{ fontSize: "13px", color: "#8892A4", lineHeight: "1.6" }}>
                  <strong style={{ color: "#00D4FF" }}>Como usar:</strong> Copie o prompt completo e cole como primeira mensagem em uma nova conversa com o Claude. O modelo irá calibrar todo o ensino com base no seu perfil cognitivo detectado.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
