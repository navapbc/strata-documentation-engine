# Verification findings — infra-security-monitoring (round 2)

Doc: `docs/sources/template-infra/infra-security-monitoring.md`
Source: `.sources/template-infra` @ `8b7bc3899c3a9ab1b3441330d72993cd34d21f70`

Overall: All five issues from round 1 have been addressed in the doc. The updated text correctly:

- Acknowledges that `.dockleconfig` and `trivy-secret.yaml` are **not** trigger paths (line 203-210)
- States that only the frequency variable is validated, while `enable_threat_detection` has no validation (line 95-96)
- Clarifies that `base_default_region` is a template input and references the actual `default_region` setting (line 56-59)
- Explicitly notes that `RestrictToTLSRequestsOnly` applies to the bucket ARN alone, unlike `BlockMalwareThreats` (line 120-122)
- Corrects the "Enabling it" step 1 to accurately reflect the threading of the `enable_storage_malware_scanning` flag (line 139-142)

Spot verification of additional claims confirms:
- GuardDuty detector is deployed as `aws_guardduty_detector` in the threat_detection module ✓
- Default region is exposed as `output "default_region"` in project-config/outputs.tf ✓
- Module exports `detector_id` and `detector_arn` outputs ✓
- Malware scanning defaults to `false` in app-config/main.tf ✓
- Flag threads correctly through dev/staging/prod.tf → env-config → storage.tf ✓
- All four CI scanners (hadolint, Trivy, Anchore/Grype, Dockle) are configured with correct failure thresholds ✓
- Checkov and tfsec compliance targets exist in Makefile ✓
- First-file composite action correctly prefers per-app overrides ✓
- Three image scanners each build the image independently (workflow comment confirmed) ✓
- Grype is configured to ignore `not-fixed`, `wont-fix`, and `unknown` findings via .grype.yml ✓

## Result

The doc is **fully supported by the source**. No findings.
