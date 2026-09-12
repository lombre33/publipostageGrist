@grist.UserTable
class Attestation:
  QualiteSignataire = grist.Text()
  NomEntite = grist.Text()
  AdresseEntite = grist.Text()
  NomBeneficiaire = grist.Text()
  DateNaissanceBeneficiaire = grist.Date()
  ObjetAttestation = grist.Text()
  LieuEtablissement = grist.Text()
  DateEtablissement = grist.Date()
