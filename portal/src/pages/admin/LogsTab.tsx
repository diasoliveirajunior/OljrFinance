import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { listarLogs, fmtData } from "@/lib/rbac-api"

export function LogsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["rbac", "logs"],
    queryFn: () => listarLogs(100),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Erro ao carregar logs: {(error as Error).message}
        </AlertDescription>
      </Alert>
    )
  }

  const logs = data?.logs ?? []
  if (logs.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhum registro de acesso ainda.
      </p>
    )
  }

  return (
    <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Quem</TableHead>
            <TableHead>Alvo</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {fmtData(l.em)}
              </TableCell>
              <TableCell className="font-medium">{l.evento}</TableCell>
              <TableCell className="text-sm">{l.email ?? "—"}</TableCell>
              <TableCell className="text-sm">{l.alvo ?? "—"}</TableCell>
              <TableCell className="text-sm font-mono text-muted-foreground">{l.ip ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
