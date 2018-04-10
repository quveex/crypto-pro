var cryptoCommon = require('./common'),
    cryptoConstants = require('./constants'),
    _certListCache;

function Certificate(item) {
    this._cert = item._cert;
    this.thumbprint = item.thumbprint;
    this.subjectName = item.subjectName.replace(/\"+/g, '"');
    this.issuerName = item.issuerName;
    this.validFrom = item.validFrom;
    this.validTo = item.validTo;
    this.serialNumber = item.serialNumber;
}

/**
 * Проверяет, валиден ли сертификат
 * */
Certificate.prototype.isValid = function isValid() {
    var cert = this._cert;

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function isValid() {
            var result;

            try {
                result = 'yield' + cert.IsValid();
                result = 'yield' + result.Result;
            } catch (err) {
                reject('Ошибка при проверке сертификата');
                return;
            }

            resolve(result);
        }));
    });
};

/**
 * Достает указанное свойство у сертификата
 * */
Certificate.prototype.getProp = function (propName) {
    var cert = this._cert;

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function getProp() {
            var result;

            try {
                result = 'yield' + cert[propName];
            } catch (err) {
                reject('Ошибка при обращении к свойству сертификата');
                return;
            }

            resolve(result);
        }));
    });
};

/**
 * Экспорт base64 представления сертификата пользователя
 * */
Certificate.prototype.exportBase64 = function exportBase64() {
    var cert = this._cert;

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function exportBase64() {
            var base64;

            try {
                base64 = 'yield' + cert.Export(0);
            } catch (err) {
                reject('Ошибка при экспорте сертификата');
                return;
            }

            resolve(base64);
        }));
    });
};

/**
 * Возвращает информацию об алгоритме
 * */
Certificate.prototype.getAlgorithm = function getAlgorithm() {
    var cert = this._cert;

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function getAlgorithm() {
            var result = {},
                algorithm;

            try {
                algorithm = 'yield' + cert.PublicKey();
                algorithm = 'yield' + algorithm.Algorithm;

                result.algorithm = 'yield' + algorithm.FriendlyName;
                result.oid = 'yield' + algorithm.Value;
            } catch (err) {
                reject('Ошибка при получении алгоритма');
                return;
            }

            resolve(result);
        }));
    });
};

/**
 * Разбирает SubjectName сертификата по тэгам
 * */
Certificate.prototype.getOwnerInfo = function getOwnerInfo() {
    return getCertInfo.call(this, cryptoCommon.subjectNameTagsTranslations, 'SubjectName');
};

/**
 * Разбирает IssuerName сертификата по тэгам
 * */
Certificate.prototype.getIssuerInfo = function getIssuerInfo() {
    return getCertInfo.call(this, cryptoCommon.issuerNameTagsTranslations, 'IssuerName');
};

/**
 * Получение OID сертификата
 *
 * @returns {Array} Возвращает массив OID (улучшенного ключа)
 * */
Certificate.prototype.getExtendedKeyUsage = function getExtendedKeyUsage() {
    var cert = this._cert;

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function getExtendedKeyUsage() {
            var OIDS = [],
                count,
                item;

            try {
                count = 'yield' + cert.ExtendedKeyUsage();
                count = 'yield' + count.EKUs;
                count = 'yield' + count.Count;

                if (count > 0) {
                    while (count > 0) {
                        item = 'yield' + cert.ExtendedKeyUsage();
                        item = 'yield' + item.EKUs;
                        item = 'yield' + item.Item(count);
                        item = 'yield' + item.OID;

                        OIDS.push(item);

                        count--;
                    }
                }
            } catch (err) {
                reject('Ошибка при получении ОИД\'ов');
                return;
            }

            resolve(OIDS);
        }));
    });
};

Certificate.prototype.getDecodedExtendedKeyUsage = cryptoCommon.getDecodedExtendedKeyUsage;

Certificate.prototype.hasExtendedKeyUsage = cryptoCommon.hasExtendedKeyUsage;

/**
 * Проверяет корректность настроек ЭП на машине
 * */
function isValidEDSSettings() {
    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function isValidEDSSettings() {
            var result;

            try {
                result = 'yield' + cryptoCommon.createObj('CAdESCOM.About');
            } catch (error) {
                reject('Настройки ЭП на данной машине не верны');
            }

            resolve();
        }));
    });
}

/**
 * Получить сертификат в формате cades по хэшу
 * */
function getCadesCert(hash) {
    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function getCadesCert() {
            var oStore = 'yield' + cryptoCommon.createObj('CAdESCOM.Store'),
                certs,
                certCnt,
                cert;

            if (!oStore) {
                reject('Не удалось получить доступ к хранилищу сертификатов');
                return;
            }

            // Открываем хранилище
            try {
                void('yield' + oStore.Open(
                    cadesplugin.CAPICOM_CURRENT_USER_STORE,
                    cadesplugin.CAPICOM_MY_STORE,
                    cadesplugin.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED
                ));
            } catch (err) {
                reject('Ошибка при открытии хранилища');
                return;
            }

            // Получаем доступ к сертификатам
            try {
                certs = 'yield' + oStore.Certificates;
                certCnt = 'yield' + certs.Count;
            } catch (err) {
                reject('Ошибка получения списка сертификатов');
                return;
            }

            if (!certCnt) {
                reject('Нет доступных сертификатов');
                return;
            }

            // Получаем сертификат по хэшу
            try {
                certs = 'yield' + certs.Find(cadesplugin.CAPICOM_CERTIFICATE_FIND_SHA1_HASH, hash);

                if (certs.Count) {
                    cert = 'yield' + certs.Item(1);
                } else {
                    throw new Error(hash);
                }
            } catch (err) {
                reject('Не удалось получить сертификат по хэшу');
                return;
            }

            oStore.Close();

            resolve(cert);
        }));
    });
}

/**
 * Разбирает информацию сертификата по тэгам
 * */
function getCertInfo(tags, propName) {
    var cert = this._cert;

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function getCertInfo() {
            var propInfo;

            try {
                propInfo = 'yield' + cert[propName];
            } catch (err) {
                reject('Ошибка при извлечении данных из сертификата');
                return;
            }

            resolve(cryptoCommon.parseCertInfo(tags, propInfo));
        }));
    });
}

function getCertBase64(hash) {
    return new Promise(function (resolve, reject) {
        getCadesCert(hash).then(function (cert) {
            eval(cryptoCommon.generateAsyncFn(function getCertBase64() {

                try {
                    base64 = 'yield' + cert.Export(0);
                } catch (err) {
                    reject('Ошибка при экспорте сертификата');
                    return;
                }

                resolve(base64);
            }))
        }, reject);
    })
}
/**
 * Возвращает список сертификатов, доступных в системе
 *
 * @param {Boolean} [resetCache=false] -- нужно ли сбросить кэш списка сертификатов
 * @returns {Promise} -- со списком сертификатов {Array}
 * */
function getCertsList(resetCache) {
    return new Promise(function (resolve, reject) {
        if (!resetCache && _certListCache) {
            resolve(_certListCache);
            return;
        }

        eval(cryptoCommon.generateAsyncFn(function getCertsList() {
             try {
                 var oStore = 'yield' + cryptoCommon.createObj('CAdESCOM.Store'),
                     result = [],
                     certs,
                     count,
                     item;
             } catch (e) {
                 reject('Операция была отменена пользователем');
                 return;
             }

            // Открываем хранилище
            try {
                void('yield' + oStore.Open(
                    cadesplugin.CAPICOM_CURRENT_USER_STORE,
                    cadesplugin.CAPICOM_MY_STORE,
                    cadesplugin.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED
                ));
            } catch (err) {
                reject('Ошибка при открытии хранилища: ');
                return;
            }

            // Получаем доступ к сертификатам
            try {
                certs = 'yield' + oStore.Certificates;

                if (certs) {
                    certs = 'yield' + certs.Find(cadesplugin.CAPICOM_CERTIFICATE_FIND_TIME_VALID);
                    /**
                     * Не рассматриваются сертификаты, в которых отсутствует закрытый ключ
                     * или не действительны на данный момент
                     * */
                    certs = 'yield' + certs.Find(
                        cadesplugin.CAPICOM_CERTIFICATE_FIND_EXTENDED_PROPERTY,
                        cryptoConstants.PropId.CAPICOM_PROPID_KEY_PROV_INFO
                    );

                    count = 'yield' + certs.Count;
                }
            } catch (err) {
                reject('Ошибка получения списка сертификатов');
                return;
            }

            if (!count) {
                reject('Нет доступных сертификатов');
                return;
            }

            try {
                while (count) {
                    item = 'yield' + certs.Item(count);
                    result.push(new Certificate({
                        _cert: 'yield' + item,
                        thumbprint: 'yield' + item.Thumbprint,
                        subjectName: 'yield' + item.SubjectName,
                        issuerName: 'yield' + item.IssuerName,
                        validFrom: 'yield' + item.ValidFromDate,
                        validTo: 'yield' + item.ValidToDate,
                        serialNumber: 'yield' + item.SerialNumber
                    }));

                    count--;
                }
            } catch (err) {
                reject('Ошибка обработки сертификатов');
                return;
            }
            oStore.Close();

            _certListCache = cryptoCommon.prepareCertsInfo(result);
            resolve(_certListCache);
        }));
    });
}

/**
 * Получить сертификат по хэшу
 * */
function getCert(hash) {
    return new Promise(function (resolve, reject) {
        if (!hash) {
            reject('Хэш не указан');
            return;
        }

        getCertsList().then(function (list) {
            var foundCert;

            list.some(function (cert) {
                if (hash === cert.thumbprint) {
                    foundCert = cert;
                    return true;
                }
            });

            if (foundCert) {
                resolve(foundCert);
            } else {
                reject('Сертификат с хэшем: "' + hash + '" не найден');
            }
        }, reject);
    });
}

function signData(hash, data, signType) {
    signType = typeof signType === 'undefined' ? true : Boolean(signType);

    return new Promise(function (resolve, reject) {
        getCadesCert(hash).then(function (cert) {
            eval(cryptoCommon.generateAsyncFn(function signData() {
                var oSignedData = 'yield' + cryptoCommon.createObj('CAdESCOM.CadesSignedData'),
                    oSigner = 'yield' + cryptoCommon.createObj('CAdESCOM.CPSigner'),
                    signature;

                var oSigningTimeAttr = 'yield' + cryptoCommon.createObj('CADESCOM.CPAttribute');
                var CAPICOM_AUTHENTICATED_ATTRIBUTE_SIGNING_TIME = 0;
                var CADESCOM_AUTHENTICATED_ATTRIBUTE_DOCUMENT_NAME = 1;
                var CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN = 1;
                var CADESCOM_BASE64_TO_BINARY = 1;
                var CADESCOM_CADES_BES = 1;
                var CAPICOM_CERTIFICATE_INCLUDE_END_ENTITY_ONLY = 2;

                var dataToSign = window.btoa(unescape(encodeURIComponent(data)));

                var oTimeNow = new Date();
                var attr = 'yield' + oSigner.AuthenticatedAttributes2;
                var oDocumentNameAttr = 'yield' + cryptoCommon.createObj("CADESCOM.CPAttribute");


                try {
                    void ('yield' + oSigningTimeAttr.propset_Name(CAPICOM_AUTHENTICATED_ATTRIBUTE_SIGNING_TIME))
                    void ('yield' + oSigningTimeAttr.propset_Value(oTimeNow));
                    void ('yield' + attr.Add(oSigningTimeAttr));
                    void ('yield' + oDocumentNameAttr.propset_Name(CADESCOM_AUTHENTICATED_ATTRIBUTE_DOCUMENT_NAME));
                    void ('yield' + oDocumentNameAttr.propset_Value("Document Name"));
                    void ('yield' + attr.Add(oDocumentNameAttr));
                    void('yield' + oSigner.propset_Certificate(cert));
                    void('yield' + oSigner.propset_Options(CAPICOM_CERTIFICATE_INCLUDE_END_ENTITY_ONLY));
                    void('yield' + oSignedData.propset_ContentEncoding(CADESCOM_BASE64_TO_BINARY));
                    void ('yield' + oSignedData.propset_Content(dataToSign));
                } catch (err) {
                    reject('Не удалось установить настройки для подписи');
                    return;
                }

                try {
                    signature = 'yield' + oSignedData.SignCades(oSigner, CADESCOM_CADES_BES, signType);
                } catch (err) {
                    reject('Не удалось создать подпись');
                    return;
                }

                resolve(signature);
            }));
        }, reject);
    });
}

/**
 * Создает подпись base64 строки по hash'у сертификата
 *
 * @param {String} hash -- fingerprint (thumbprint) сертификата
 * @param {String} dataBase64 -- строковые данные в формате base64
 * @param {Boolean} signType -- тип подписи открепленная (true) / присоединенная (false) (default: true)
 * @returns {Promise} -- обещание, которое зарезолвится с данными о подписи {String}
 * */
function signDataBase64(hash, dataBase64, signType) {
    signType = typeof signType === 'undefined' ? true : Boolean(signType);

    return new Promise(function (resolve, reject) {
        getCadesCert(hash).then(function (cert) {
            eval(cryptoCommon.generateAsyncFn(function signDataBase64() {
                var clientTime = new Date(),
                    oAttrs = 'yield' + cryptoCommon.createObj('CADESCOM.CPAttribute'),
                    oSignedData = 'yield' + cryptoCommon.createObj('CAdESCOM.CadesSignedData'),
                    oSigner = 'yield' + cryptoCommon.createObj('CAdESCOM.CPSigner'),
                    attrs,
                    signature;

                clientTime = cryptoCommon.getDateObj(clientTime);

                try {
                    void('yield' + oAttrs.propset_Name(cryptoConstants.Time.AUTHENTICATED_ATTRIBUTE_SIGNING_TIME));
                    void('yield' + oAttrs.propset_Value(clientTime));
                } catch (err) {
                    reject('Ошибка при установке данных подписи');
                    return;
                }

                // Задаем настройки для подписи
                try {
                    void('yield' + oSigner.propset_Certificate(cert));
                    attrs = 'yield' + oSigner.AuthenticatedAttributes2;
                    void('yield' + attrs.Add(oAttrs));
                    void('yield' + oSignedData.propset_ContentEncoding(cadesplugin.CADESCOM_BASE64_TO_BINARY));
                    void('yield' + oSignedData.propset_Content(dataBase64));
                    void('yield' + oSigner.propset_Options(cadesplugin.CAPICOM_CERTIFICATE_INCLUDE_END_ENTITY_ONLY));
                } catch (err) {
                    reject('Не удалось установить настройки для подписи');
                    return;
                }

                try {
                    signature = 'yield' + oSignedData.SignCades(
                        oSigner,
                        cadesplugin.CADESCOM_CADES_BES,
                        signType
                    );
                } catch (err) {
                    reject('Не удалось создать подпись');
                    return;
                }

                resolve(signature);
            }));
        }, reject);
    });
}

/**
 * Создает подпись XML строки по hash'у сертификата
 *
 * @param {String} hash -- fingerprint (thumbprint) сертификата
 * @param {String} dataXML -- данные в формате XML
 * @returns {Promise} -- обещание, которое зарезолвится с данными о подписи {String}
 * */
function signDataXML(hash, dataXML) {
    return new Promise(function (resolve, reject) {
        getCadesCert(hash).then(function (cert) {
            eval(cryptoCommon.generateAsyncFn(function signDataXML() {
                var oSigner = 'yield' + cryptoCommon.createObj('CAdESCOM.CPSigner'),
                    signerXML = 'yield' + cryptoCommon.createObj('CAdESCOM.SignedXML'),
                    cnts = cryptoConstants,
                    signature;

                // Задаем настройки для подписи
                try {
                    void('yield' + oSigner.propset_Certificate(cert));
                    // Добавляем данные для подписи
                    void('yield' + signerXML.propset_Content(dataXML));
                    // Устанавливаем тип подписи
                    void('yield' + signerXML.propset_SignatureType(cnts.SignatureType.CADESCOM_XML_SIGNATURE_TYPE_ENVELOPED));
                    // Устанавливаем алгоритм подписи
                    void('yield' + signerXML.propset_SignatureMethod(cnts.GostXmlDSigUrls.XmlDsigGost3410Url));
                    // Устанавливаем алгоритм хэширования
                    void('yield' + signerXML.propset_DigestMethod(cnts.GostXmlDSigUrls.XmlDsigGost3411Url));
                } catch (err) {
                    reject('Не удалось установить настройки для подписи');
                    return;
                }

                try {
                    signature = 'yield' + signerXML.Sign(oSigner);
                } catch (err) {
                    reject('Не удалось создать подпись');
                    return;
                }

                resolve(signature);
            }));
        }, reject);
    });
}

/**
 * Возвращает информацию о версии CSP и плагина
 * */
function getSystemInfo() {
    var sysInfo = cryptoCommon.getEnvInfo();

    return new Promise(function (resolve, reject) {
        eval(cryptoCommon.generateAsyncFn(function getSystemInfo() {
            var e;

            try {
                e = 'yield' + cryptoCommon.createObj('CAdESCOM.About');

                sysInfo.cadesVersion = 'yield' + e.PluginVersion;
                // Возможен вызов в ранних версиях в виде sysInfo.cspVersion = 'yield' + e.CSPVersion('', 75);
                sysInfo.cspVersion = 'yield' + e.CSPVersion();

                if (!sysInfo.cadesVersion) {
                    sysInfo.cadesVersion = 'yield' + e.Version;
                }

                sysInfo.cadesVersion = 'yield' + sysInfo.cadesVersion.toString();
                sysInfo.cspVersion = 'yield' + sysInfo.cspVersion.toString();

                resolve(sysInfo);
            } catch (err) {
                reject('Ошибка при получении информации о системе');
            }
        }));
    });
}

/**
 * Promise обертка для синхронного вызова проверки версии CSP
 * */
function isValidCSPVersion(version) {
    return new Promise(function (resolve) {
        resolve(cryptoCommon.isValidCSPVersion(version));
    });
}

/**
 * Promise обертка для синхронного вызова проверки версии плагина
 * */
function isValidCadesVersion(version) {
    return new Promise(function (resolve) {
        resolve(cryptoCommon.isValidCadesVersion(version));
    });
}

module.exports = {
    isValidEDSSettings: isValidEDSSettings,
    getCertsList: getCertsList,
    getCert: getCert,
    signData: signData,
    signDataBase64: signDataBase64,
    signDataXML: signDataXML,
    getSystemInfo: getSystemInfo,
    isValidCSPVersion: isValidCSPVersion,
    isValidCadesVersion: isValidCadesVersion,
    getCertBase64: getCertBase64
};
