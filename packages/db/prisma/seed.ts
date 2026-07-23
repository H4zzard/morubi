// ============================================================================
// Seed de demonstração do Morubi.
// Cria um tenant, itens de base de conhecimento e (opcionalmente) usuários demo.
//
// IMPORTANTE: User.id precisa casar com o id do Supabase Auth. Para uma demo
// completa, crie os usuários via signup no app. Este seed foca na base de
// conhecimento e num tenant de exemplo. Rode a ingestão de embeddings depois
// (o app faz isso ao criar/editar itens; aqui deixamos o embedding nulo e
// registramos um aviso).
// ============================================================================
import { prisma } from "../src/index.js";

const DEMO_TENANT_ID = "demo-tenant-morubi";

const KNOWLEDGE = [
  {
    title: "Planos e preços",
    content:
      "O Morubi tem 3 planos: Starter (R$149/mês, até 3 vendedores), Pro (R$399/mês, até 10 vendedores, dashboards avançados) e Scale (sob consulta, ilimitado). Todos incluem 14 dias de teste grátis sem cartão.",
  },
  {
    title: "Política de garantia e reembolso",
    content:
      "Oferecemos garantia incondicional de 30 dias. Se o cliente cancelar dentro desse prazo, o reembolso é integral e processado em até 5 dias úteis. Após 30 dias, não há reembolso proporcional, mas o cancelamento pode ser feito a qualquer momento sem multa.",
  },
  {
    title: "Contorno de objeção: preço",
    content:
      "Quando o cliente diz que está caro, reposicione para custo por vendedor por dia (menos de R$5) e ancore no aumento médio de conversão de 18% relatado pelos clientes. Ofereça o teste grátis de 14 dias para reduzir o risco percebido.",
  },
  {
    title: "Diferencial: memória evolutiva",
    content:
      "Diferente de assistentes genéricos, o Morubi aprende com as correções do time: quando o vendedor corrige uma sugestão, a IA passa a acertar dali pra frente. O gestor pode promover boas correções para toda a empresa.",
  },
  {
    title: "Prazo de implantação",
    content:
      "A implantação leva menos de 1 dia: o gestor cria a conta, sobe a base de conhecimento e convida os vendedores. Não há integração técnica obrigatória — a extensão funciona direto no WhatsApp Web.",
  },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: {},
    create: { id: DEMO_TENANT_ID, name: "Empresa Demo Morubi", segment: "SaaS B2B" },
  });

  for (const item of KNOWLEDGE) {
    const existing = await prisma.knowledgeItem.findFirst({
      where: { tenantId: tenant.id, title: item.title },
    });
    if (!existing) {
      await prisma.knowledgeItem.create({
        data: { tenantId: tenant.id, title: item.title, content: item.content },
      });
    }
  }

  console.log(`Seed concluído. Tenant "${tenant.name}" com ${KNOWLEDGE.length} itens de base.`);
  console.log(
    "Aviso: embeddings ainda não gerados. Edite/recrie os itens pelo app OU rode o script de re-ingestão para popular a coluna embedding.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
