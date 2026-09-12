@grist.UserTable
class Relance:
  ExpediteurNom = grist.Text()
  ExpediteurAdresse = grist.Text()
  ClientNom = grist.Text()
  ClientAdresse = grist.Text()
  NumeroFacture = grist.Text()
  DateFacture = grist.Date()
  DateEcheance = grist.Date()
  MontantDu = grist.Numeric()
  LieuEnvoi = grist.Text()
  DateEnvoi = grist.Date()
