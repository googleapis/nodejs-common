import {GoogleAuthOptions, Operation,Service, ServiceConfig, ServiceOptions,
  CreateOptions, DeleteCallback, ExistsCallback, GetConfig, GetMetadataCallback,
  InstanceResponseCallback, Interceptor, Metadata, Methods, ServiceObject,
  ServiceObjectConfig, StreamRequestOptions, Abortable, AbortableDuplex,
  ApiError, util} from '@google-cloud/common';

util.makeRequest({uri: 'test'}, {}, (err, body, res) => {
  console.log(err);
});

