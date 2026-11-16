import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/contexts/auth"

interface Info {
  title: string
  desc: string
  canRequest?: boolean
}

const INFO: Record<string, Info> = {
  sem_acesso: {
    title: "Acesso ainda não liberado",
    desc: "Você está autenticado, mas ainda não tem acesso ao portal. Solicite acesso para que o administrador analise.",
    canRequest: true,
  },
  solicitacao_pendente: {
    title: "Solicitação em análise",
    desc: "Sua solicitação de acesso já foi recebida e está aguardando aprovação do administrador.",
  },
  solicitacao_rejeitada: {
    title: "Solicitação recusada",
    desc: "Sua solicitação de acesso não foi aprovada. Fale com o administrador para mais informações.",
  },
  solicitacao_aprovada: {
    title: "Acesso aprovado",
    desc: "Seu acesso foi aprovado. Se ainda não consegue entrar, saia e entre novamente.",
  },
  inativo: {
    title: "Acesso inativo",
    desc: "Seu acesso está inativo ou foi bloqueado. Entre em contato com o administrador.",
  },
}

export function AccessGate() {
  const { me, logout } = useAuth()
  const navigate = useNavigate()
  const cur = INFO[me?.status ?? "sem_acesso"] ?? INFO.sem_acesso

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{cur.title}</CardTitle>
          <CardDescription>{me?.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{cur.desc}</p>
          <div className="flex gap-2">
            {cur.canRequest && (
              <Button onClick={() => navigate("/solicitar-acesso")}>
                Solicitar acesso
              </Button>
            )}
            <Button variant="outline" onClick={() => logout()}>
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
