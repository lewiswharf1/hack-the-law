import httpx
from bs4 import BeautifulSoup

EURLEX_HTML_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex_id}"
CELLAR_SPARQL_URL = "https://publications.europa.eu/webapi/rdf/sparql"


def fetch_article_text(celex_id: str, article_number: str) -> dict:
    """
    Fetch full text of a specific article from EUR-Lex HTML (public endpoint).
    Returns {"title": str, "text": str}
    """
    url = EURLEX_HTML_URL.format(celex_id=celex_id)
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    return _extract_article(soup, article_number, celex_id)


def fetch_related_case_law(celex_id: str, article_number: str) -> list[dict]:
    """
    Query CELLAR SPARQL endpoint for the top 10 most recent CJEU cases mentioning
    the given regulation and article. Returns [{"title": str, "celex_id": str, "url": str}]
    """
    query = f"""
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?caseUri ?caseTitle ?date
    WHERE {{
      ?caseUri a cdm:case_law ;
               skos:prefLabel ?caseTitle ;
               cdm:date_publication ?date ;
               cdm:refers_to_eli_document ?eli .
      ?eli cdm:eli_document_identifier ?eliId .
      FILTER(CONTAINS(?eliId, "{celex_id}") || CONTAINS(?caseTitle, "Art. {article_number}"))
    }}
    ORDER BY DESC(?date)
    LIMIT 10
    """

    resp = httpx.get(
        CELLAR_SPARQL_URL,
        params={
            "query": query,
            "format": "json"
        },
        timeout=30
    )
    resp.raise_for_status()

    results = resp.json().get("results", {}).get("bindings", [])
    return [
        {
            "title": r.get("caseTitle", {}).get("value", ""),
            "celex_id": r.get("caseUri", {}).get("value", "").split("/")[-1],
            "url": r.get("caseUri", {}).get("value", "")
        }
        for r in results
        if r.get("caseTitle", {}).get("value")
    ]


def _extract_article(soup: BeautifulSoup, article_number: str, celex_id: str) -> dict:
    """
    Parse the EUR-Lex HTML to extract a specific article by number.
    Tries multiple class patterns: ti-art, sti-art, or plain text search.
    """
    target = f"Article {article_number}"

    # Try class="ti-art" first
    headings = soup.find_all("p", class_="ti-art")

    if not headings:
        # Fallback to class="sti-art"
        headings = soup.find_all("p", class_="sti-art")

    if headings:
        for heading in headings:
            if target.lower() in heading.get_text().lower():
                # Collect text until the next article heading
                title_el = heading.find_next_sibling()
                title = title_el.get_text(strip=True) if title_el else ""

                # Gather body text until next article heading
                body_parts = []
                for sibling in heading.find_next_siblings():
                    if sibling.name == "p" and any(
                        cls in sibling.get("class", [])
                        for cls in ["ti-art", "sti-art"]
                    ):
                        break
                    body_parts.append(sibling.get_text(separator=" ", strip=True))

                return {
                    "title": title,
                    "text": f"{target}\n{title}\n\n" + "\n\n".join(body_parts)
                }

    # Fallback: search for Article N in any <p> or <h3>
    all_paras = soup.find_all(["p", "h3"])
    for i, para in enumerate(all_paras):
        if target.lower() in para.get_text().lower():
            title = para.get_text(strip=True)
            body_parts = []
            for sibling in para.find_next_siblings():
                text = sibling.get_text(strip=True)
                if target.lower() in text.lower() or (
                    sibling.name in ["p", "h3"]
                    and any(f"article {j}" in text.lower() for j in range(1, 100))
                ):
                    break
                if text:
                    body_parts.append(text)

            return {
                "title": title,
                "text": f"{target}\n{title}\n\n" + "\n\n".join(body_parts[:50])
            }

    raise ValueError(f"Article {article_number} not found in CELEX:{celex_id}")
