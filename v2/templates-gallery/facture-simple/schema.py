@grist.UserTable
class Facture_Simple:
  NomClient = grist.Text()
  DateFacture = grist.Date()
  MontantHT = grist.Numeric()
