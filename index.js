'use strict';

var AWS = require('aws-sdk');
var dynamo = new AWS.DynamoDB({
  region: process.env[REGION];
});

const https = require('https');
const querystring = require('querystring');

var ChannelAccessToken = process.env['CHANNELACCESSTOKEN'];
// var mode = [];

var getParams = {
  "TableName": " ",
  "Key": {
    "id":{"S":" "}
  }
};

var scanParams = {
  "TableName": " ",
};



exports.handler = (event, context, callback) => {

  console.log('EVENT: ', event);

  var event_data = JSON.parse(event.body);
  console.log('EVENT_Data: ', JSON.stringify(event_data));

  const messageData = event_data.events && event_data.events[0];
  var id = messageData.source.userId;

   //グループからのメッセージ
  if(messageData.source.groupId != null && messageData.source.groupId.length > 0){
    id = messageData.source.groupId;
  }


  // DynamoDB上を検索し，ユーザ情報を取得
  getParams.Key.id = {"S": id};
  getParams.TableName = "UserTable";
  dynamo.getItem(getParams,function(err,dynamoGetData){
    if(err){
      console.log("dynamoDB getItem err: " + err);
      callback(null, 'Success!');
    }

    console.log("dynamoDB getItem: " + JSON.stringify(dynamoGetData));

    // 初回アクセスユーザの処理(Insert DisplayName in DynamoDB)
    if (Object.keys(dynamoGetData).length == 0){

      // Get displayName from Line
      var options = {
        hostname: 'api.line.me',
        path: '/v2/bot/profile/' + id,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': 'Bearer ' + ChannelAccessToken
        },
        method: 'GET',
      };

      var req = https.request(options,  function(res){
        res.setEncoding('utf8');
        res.on('data',function(userInformation) {
          var userName = JSON.parse(userInformation).displayName;
          console.log("UserName: " + userName);

          var table = "UserTable";
          var item = {
            "id":  {"S":id},
            "Name":{"S":userName},
            "YamabikoFlag":{"BOOL":true},
            "NickName":{"S":" "}
          };
          dynamoPutItem(table,item);
        });
      });
      req.on('error', function(e) {
        var message = "通知に失敗しました. LINEから次のエラーが返りました: " + e.message;
        console.error(message);
        context.fail(message);
      });
      req.end();

      var response =  "初メッセージありがとう！\nニックネーム教えてください！";
      var postData = JSON.stringify({
        "messages": [{
          "type": "text",
          "text": response
        }],
        "to": id
      });
      postToLineBot(postData);
      callback(null, 'Success!');
    }


    // アクセス2回目のユーザの処理(Insert NickName in DynamoDB)
    else if(dynamoGetData.Item.NickName.S == " ") {

      if(messageData.message.type == "text"){
        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set NickName =:n" ;
        var expressionAttributeValues ={":n":{"S":messageData.message.text}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        var response = "こんにちは！" + messageData.message.text + "さん！";
      }
      else{
        var response = "ニックネーム教えて欲しいな！";
      }

      var postData = JSON.stringify({
        "messages": [{
          "type": "text",
          "text": response
        }],
        "to": id
      });
      postToLineBot(postData);
      callback(null, 'Success!');
    }


    // アクセス3回以上のユーザの処理
    else{
      // 処理モード変更
      console.log("messageData.message.text: " + messageData.message.text);
      switch(messageData.message.text){
        //  永続モード
        case "やまびこモード" :
        var response = "やまびこモードに変更！\nこのモードでは発言をリピートするよ！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);

        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set YamabikoFlag =:y" ;
        var expressionAttributeValues ={":y":{"BOOL":true}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;


        case "やまびかないモード" :
        var response = "やまびかないモードに変更！\nこのモードでは発言をリピートしないよ！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);

        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set YamabikoFlag =:y" ;
        var expressionAttributeValues ={":y":{"BOOL":false}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;



        //  非永続モード
        case "ニックネーム変更" :
        var response = "ニックネームを変更します！\nニックネームを教えてください！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);

        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set NickName =:n" ;
        var expressionAttributeValues ={":n":{"S":" "}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;


        case "ヘルプ" :
        var response = "以下の単語を送信すると，モードが切り替わります\n ・やまびこモード\n ・やまびかないモード\n ・ニックネーム変更\n\n ・こんにちは";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);
        callback(null, 'Success!');
        break;


        case "こんにちは" :
        case "こんばんは" :
        var response = messageData.message.text + "！"+ dynamoGetData.Item.NickName.S + "さん！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });

        postToLineBot(postData);
        callback(null, 'Success!');
        break;

        //////////////////// やまびこ or Not やまびこ　////////////////////
        default:

        // やまびこモード
        if (dynamoGetData.Item.YamabikoFlag.BOOL == true){
          // テキスト返答
          if(messageData.message.type == "text"){
            var postData = JSON.stringify({
              "messages": [{
                "type": "text",
                "text": messageData.message.text
              }],
              "to": id
            });
            postToLineBot(postData);
          }
          // スタンプ返答(有料スタンプは返答不可？)
          else if(messageData.message.type == "sticker"){
            var postData = JSON.stringify({
              "messages": [{
                "type": "sticker",
                "stickerId": messageData.message.stickerId,
                "packageId": messageData.message.packageId
              }],
              "to": id
            });
            postToLineBot(postData);
          }
          // エラー
          else{
            console.log("Debug:");
          }
          callback(null, 'Success!');
        }

        // やまびかないモード
        else if (dynamoGetData.Item.YamabikoFlag.BOOL == false){
          scanParams.TableName = "MentionTable";
          dynamo.scan(scanParams, function(err,dynamoScanData){
            if(err){
              console.log("dynamoDB scanItem err: " + err);
              callback(null, 'Success!');
            }

            var random = Math.floor(Math.random() * Math.floor(dynamoScanData.Items.length));
            console.log("random :" + random);

            var postData = JSON.stringify({
              "messages": [{
                "type": "text",
                "text": dynamoScanData.Items[random].Mention.S
              }],
              "to": id
            });
            postToLineBot(postData);
            callback(null, 'Success!');
          });
        }

        // エラー
        else{
          console.log("Debug:");
          callback(null, 'Success!');
        }
        break;
      }
    }
  });
};



/////////////////// Function ///////////////////

var dynamoPutItem = function(table,item){
  var putParams = {
    "TableName": table,
    "Item": item
  };
  dynamo.putItem(putParams, function(err,dynamoPutData){
    console.log("dynamoDB putItem err: " + err);
    context.done(null,dynamoPutData);
  });

}

var dynamoUpdateItem = function(table,key,updateExpression,expressionAttributeValues){
  var updateParams = {
    "TableName": table,
    "Key": key,
    "UpdateExpression": updateExpression,
    "ExpressionAttributeValues":expressionAttributeValues
  };
  dynamo.updateItem(updateParams, function(err,dynamoUpdateData){
    console.log("dynamoDB updateItem err: " + err);
  });

}

var postToLineBot = function(postData){
  var options = {
    hostname: 'api.line.me',
    path: '/v2/bot/message/push',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': 'Bearer ' + ChannelAccessToken
    },
    method: 'POST',
  };
  console.log("MessagePush RequestHeader: " + JSON.stringify(options));


  // APIリクエスト
  var req = https.request(options,  function(res){
    res.setEncoding('utf8');
  });

  console.log("PostData: " + postData);
  req.write(postData);

  req.on('data', function (body) {
    console.log("RequestBody: " + body);
  });

  req.on('error', function(e) {
    var message = "通知に失敗しました. LINEから次のエラーが返りました: " + e.message;
    console.error(message);
    context.fail(message);
  });

  req.end();

}
