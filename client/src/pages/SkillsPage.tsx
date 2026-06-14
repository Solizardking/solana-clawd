import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BookOpen, Code2, ExternalLink, Search, ShieldCheck, Sparkles } from "lucide-react";

type SkillSummary = {
  slug: string;
  name: string;
  displayName: string;
  sourcePath: string;
  upstreamUrl: string | null;
  version: string;
  description: string;
  homepage: string | null;
  author: string | null;
  license: string | null;
  tags: string[];
  readmeExcerpt: string;
  exampleCount: number;
  examples: Array<{ filename: string; path: string; language: string; size: number }>;
};

type SkillDetail = Omit<SkillSummary, "examples"> & {
  readme: string;
  skillMd: string;
  examples: Array<{ filename: string; path: string; language: string; content: string }>;
  meta: Record<string, unknown>;
};

type SkillsResponse = {
  count: number;
  upstream?: {
    repository: string;
    branch: string;
    skillsUrl: string;
    arenaUrl: string;
    arenaInstallUrl: string;
    arenaInstallCommand: string;
  };
  skills: SkillSummary[];
};

function firstHeading(markdown: string) {
  return markdown.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ?? "";
}

export default function SkillsPage() {
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("agent-arena-skill");

  const { data, isLoading } = useQuery<SkillsResponse>({ queryKey: ["/api/skills"] });
  const { data: selected } = useQuery<SkillDetail>({
    queryKey: [`/api/skills/${selectedSlug}`],
    enabled: Boolean(selectedSlug),
  });

  const skills = data?.skills ?? [];
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return skills;
    return skills.filter((skill) =>
      [skill.displayName, skill.name, skill.description, ...skill.tags].join(" ").toLowerCase().includes(term),
    );
  }, [query, skills]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <section className="mb-6 border-b border-white/10 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
              <Sparkles className="mr-1 h-3 w-3" />
              Cheshire Skills
            </Badge>
            <Badge variant="outline" className="border-white/15 text-white/65">
              {data?.count ?? 0} local skill{data?.count === 1 ? "" : "s"}
            </Badge>
            {data?.upstream?.repository && (
              <a href={data.upstream.repository} target="_blank" rel="noreferrer">
                <Badge variant="outline" className="border-white/15 text-white/65 hover:bg-white/10">
                  GitHub source
                </Badge>
              </a>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Skill Catalog</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Public agent skills loaded from the local Cheshire Terminal hub and imported Solana Clawd catalog
            for arena agents, developers, and operator workflows.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search skills"
                className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/35"
              />
            </div>

            {isLoading && <div className="text-sm text-white/50">Loading skills...</div>}
            {filtered.map((skill) => (
              <button
                key={skill.slug}
                type="button"
                onClick={() => setSelectedSlug(skill.slug)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedSlug === skill.slug
                    ? "border-cyan-400/40 bg-cyan-500/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <div className="text-sm font-semibold text-white">{skill.displayName}</div>
                <div className="mt-1 line-clamp-3 text-xs text-white/55">{skill.description}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="border-white/10 text-white/55">v{skill.version}</Badge>
                  <Badge variant="outline" className="border-white/10 text-white/55">{skill.sourcePath}</Badge>
                  <Badge variant="outline" className="border-white/10 text-white/55">{skill.exampleCount} examples</Badge>
                </div>
              </button>
            ))}
          </aside>

          <main className="space-y-5">
            {selected && (
              <>
                <Card className="border-cyan-500/20 bg-white/[0.03]">
                  <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle className="text-2xl text-cyan-100">{selected.displayName}</CardTitle>
                        <p className="mt-2 text-sm text-white/60">{selected.description}</p>
                      </div>
                      {selected.homepage && (
                        <a href={selected.homepage} target="_blank" rel="noreferrer">
                          <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Homepage
                          </Button>
                        </a>
                      )}
                      {selected.upstreamUrl && (
                        <a href={selected.upstreamUrl} target="_blank" rel="noreferrer">
                          <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Source
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Local catalog
                      </Badge>
                      {selected.version && <Badge variant="outline" className="border-white/10 text-white/60">Version {selected.version}</Badge>}
                      <Badge variant="outline" className="border-white/10 text-white/60">{selected.sourcePath}</Badge>
                      {selected.license && <Badge variant="outline" className="border-white/10 text-white/60">{selected.license}</Badge>}
                      {selected.author && <Badge variant="outline" className="border-white/10 text-white/60">{selected.author}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span key={tag} className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/55">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <section className="grid gap-4 md:grid-cols-3">
                  <Card className="border-white/10 bg-white/[0.03] p-4">
                    <BookOpen className="mb-3 h-5 w-5 text-cyan-300" />
                    <div className="text-sm font-semibold">Instructions</div>
                    <div className="mt-1 text-xs text-white/55">Full `SKILL.md` guidance is available to agents and developers from the API.</div>
                  </Card>
                  <Card className="border-white/10 bg-white/[0.03] p-4">
                    <Code2 className="mb-3 h-5 w-5 text-fuchsia-300" />
                    <div className="text-sm font-semibold">Discovery</div>
                    <div className="mt-1 text-xs text-white/55">Search by name, description, or tags across imported Solana Clawd skills.</div>
                  </Card>
                  <Card className="border-white/10 bg-white/[0.03] p-4">
                    <ShieldCheck className="mb-3 h-5 w-5 text-emerald-300" />
                    <div className="text-sm font-semibold">Arena Ready</div>
                    <div className="mt-1 text-xs text-white/55">Local source paths make it clear which skill package agents should load.</div>
                  </Card>
                </section>

                <Card className="border-white/10 bg-white/[0.03]">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">{firstHeading(selected.readme) || "Overview"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-4 text-xs leading-relaxed text-white/70">
                      {selected.readme}
                    </pre>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.03]">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Examples</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selected.examples.map((example) => (
                      <div key={example.path} className="rounded-lg border border-white/10 bg-black/40">
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                          <div className="text-sm font-semibold text-cyan-100">{example.filename}</div>
                          <div className="text-xs text-white/35">{example.path}</div>
                        </div>
                        <pre className="max-h-96 overflow-auto p-3 text-xs leading-relaxed text-white/70">
                          <code>{example.content}</code>
                        </pre>
                      </div>
                    ))}
                    {!selected.examples.length && (
                      <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/50">
                        No example files are bundled with this skill.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
