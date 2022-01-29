using {app26012022.db as db} from '../db/data-model';

using {CV_SALES, CV_SESSION_INFO} from '../db/data-model';


using { API_BUSINESS_PARTNER } from './external/API_BUSINESS_PARTNER.csn';










service CatalogService @(path : '/catalog')
@(requires: 'authenticated-user')
{

    entity Sales2
           as select * from db.Sales
      
    ;

    entity Sales
      @(restrict: [{ grant: ['READ'],
                     to: 'Viewer'
                   },
                   { grant: ['WRITE'],
                     to: 'Admin' 
                   }
                  ])
      as select * from db.Sales
      actions {
        @(restrict: [{ to: 'Admin' }])
        action boost();
      }
    ;

    @readonly
    entity VSales
      @(restrict: [{ to: 'Viewer' }])
      as select * from CV_SALES
    ;

    @readonly
    entity SessionInfo
      @(restrict: [{ to: 'Viewer' }])
      as select * from CV_SESSION_INFO
    ;

    function topSales
      @(restrict: [{ to: 'Viewer' }])
      (amount: Integer)
      returns many Sales;


    @readonly
    entity BusinessPartners
      @(restrict: [{ to: 'Viewer' }])
      as projection on API_BUSINESS_PARTNER.A_BusinessPartner {
          BusinessPartner,
          Customer,
          FirstName,
          LastName,
          CorrespondenceLanguage
        };










    type userScopes { identified: Boolean; authenticated: Boolean; Viewer: Boolean; Admin: Boolean; ExtendCDS: Boolean; ExtendCDSdelete: Boolean;};
    type user { user: String; locale: String; tenant: String; scopes: userScopes; };
    function userInfo() returns user;
};
