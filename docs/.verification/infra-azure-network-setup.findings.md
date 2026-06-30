# Verification findings: infra-azure-network-setup (round 1)

Doc: `docs/sources/template-infra-azure/infra-network-setup.md`
Source: `.sources/template-infra-azure`

## Result

No findings. Every claim in the doc is supported by the cited source files.

- `docs/infra/set-up-network.md` — VNet / subnets / private DNS zones / Container
  App Environment list, requirements (account -> custom domains -> HTTPS ->
  app-config `has_database`/`network_name`, `local.apps_in_network`), three
  networks default, delegated subnets (`gateway`, `private-endpoints`, `database`
  -> `Microsoft.DBforPostgreSQL/flexibleServers`, `apps-private` ->
  `Microsoft.App/environments`), gateway lockdown via `outbound_peer_cidrs`,
  `internet_access` default-deny, the alternative public-ingress setup with
  `*.azurecontainerapps.io` / service endpoints, and the
  `infra-configure-network` / `infra-update-network` commands all match.
- `docs/infra/set-up-custom-domains.md` — hosted zone, `shared_hosted_zone`, NS
  delegation + `terraform ... output -json hosted_zone_name_servers`,
  `nslookup -type=NS`, `domain_name` rules, A-record creation via
  `infra-update-app-service`, repeat-per-app, `manage_dns = false` all match.
- `docs/infra/https-support.md` — ACME default (Let's Encrypt staging), Key Vault
  (DigiCert/GlobalSign) alternative, custom-domains prerequisite, `manage_certs`,
  `source = "issued"`, `cert_name` in service env-config, and the
  `infra-update-network` / `infra-update-app-service` commands all match.

Note on "VPC endpoints" (doc line 41): the doc reproduces the source verbatim —
`set-up-network.md` line 27 itself says "VPC endpoints needed by the database
layer." Since the verifier checks the doc against the source, this is a faithful
reproduction and is NOT a finding. (Any AWS-vs-Azure terminology cleanup would be
an upstream-source fix, not a doc inaccuracy.)

The findings array is empty.
