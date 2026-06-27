import json
import re
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

GRAPH_BUILD_PROMPT = """You are a legal AI assistant specialising in EU regulation litigation.

The following EU regulation article(s) have been selected as the basis for a legal claim:

{articles}

Related case law from CJEU (for context and precedent):
{case_law}

Case context:
- Case name: {case_name}
- Client: {client}

Your task: Propose a structured argument graph for this claim. Each "element" is a top-level legal requirement that must be proven. Each "proposition" is a specific, falsifiable sub-claim within that element. Consider the related case law as precedent and context.

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{{
  "elements": [
    {{
      "label": "E1",
      "title": "Short descriptive title of this legal element",
      "source": "Art. XX GDPR",
      "propositions": [
        {{
          "label": "E1-P1",
          "title": "Specific legal proposition that must be established"
        }}
      ]
    }}
  ]
}}

Guidelines:
- Derive elements directly from the legal structure of the articles
- 3–5 elements is typical
- 2–4 propositions per element
- Each proposition must be a concrete, evidence-testable statement
- Labels must be sequential: E1, E2, E3 and E1-P1, E1-P2, etc.
- For Art. 82 GDPR claims, the three core elements are: (1) GDPR infringement by controller, (2) damage suffered by data subject, (3) causal link between infringement and damage
- Use related case law to inform the propositions and identify sub-elements courts have found relevant
"""

DOC_ANALYSIS_PROMPT = """You are a legal AI assistant. Analyse the following document in the context of an EU law claim.

DOCUMENT TEXT:
{doc_text}

LEGAL PROPOSITIONS TO MAP AGAINST:
{propositions_json}

Your tasks:
1. Classify the document type
2. Identify excerpts that are evidence for specific propositions
3. Classify each excerpt as Supportive, Adverse, or Neutral to its proposition
4. Identify which propositions have NO supporting evidence (gaps)
5. For each gap, suggest a specific remedial action

Return ONLY valid JSON (no markdown, no explanation):
{{
  "doc_type": "Expert Report | Judgment | Witness Statement | Correspondence | Regulation",
  "evidence_mappings": [
    {{
      "proposition_id": "uuid-of-proposition",
      "excerpt": "Exact or near-exact text from the document",
      "classification": "Supportive | Adverse | Neutral",
      "source_ref": "e.g. §4.2, p.12, para 17"
    }}
  ],
  "suggested_gaps": [
    {{
      "proposition_id": "uuid-of-proposition",
      "title": "Short gap title",
      "why": "Why this is a gap in the current evidence",
      "severity": "Critical | High | Medium",
      "action": "Specific recommended action to address this gap"
    }}
  ]
}}

Important:
- Only include evidence_mappings where the document actually contains relevant content
- Only flag a gap if the proposition has no supportive evidence across all documents (not just this one)
- Use the exact proposition UUIDs provided, not labels
- Keep excerpts under 300 characters, capturing the most legally significant sentence
"""


def _parse_json(text: str) -> dict:
    """Extract JSON from Claude response, handling markdown code fences."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


def build_argument_graph(case_name: str, client_name: str, articles: list[dict], case_law: list[dict] = None) -> dict:
    """
    articles: [{"article_number": "82", "article_title": "...", "article_text": "..."}]
    case_law: [{"title": "Case name", "celex_id": "...", "url": "..."}] (optional)
    Returns parsed JSON dict with 'elements' key.
    """
    articles_str = "\n\n---\n\n".join(
        f"Article {a['article_number']} — {a['article_title']}\n\n{a['article_text']}"
        for a in articles
    )

    case_law_str = "None found."
    if case_law:
        case_law_str = "\n".join(
            f"- {cl['title']} ({cl['celex_id']})"
            for cl in case_law
        )

    prompt = GRAPH_BUILD_PROMPT.format(
        articles=articles_str,
        case_law=case_law_str,
        case_name=case_name,
        client=client_name,
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    return _parse_json(response.content[0].text)


def analyse_document(doc_text: str, propositions: list[dict]) -> dict:
    """
    propositions: [{"id": uuid, "label": "E1-P1", "title": "..."}]
    Returns parsed JSON dict with 'doc_type', 'evidence_mappings', 'suggested_gaps'.
    """
    truncated = doc_text[:50_000]
    prompt = DOC_ANALYSIS_PROMPT.format(
        doc_text=truncated,
        propositions_json=json.dumps(propositions, indent=2),
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    return _parse_json(response.content[0].text)
