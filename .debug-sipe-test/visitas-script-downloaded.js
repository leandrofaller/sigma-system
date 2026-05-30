$(document).ready(function () {

    $("input").blur(function () {
        if($(this).hasClass('naoValidar') == true   )
        {
            //não valida o input
        }
        else {
            if ($(this).val() == "") {
                $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
                $(this).closest('.form-group').find('i.fa').remove();
                $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
            }
            else {
                $(this).closest('.form-group').removeClass('has-error has-feedback'); //.addClass('has-success has-feedback');
                $(this).closest('.form-group').find('i.fa').remove();
            }
        }
    });

    $("textarea").blur(function () {
        if ($(this).val() == "") {
            $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
            $(this).closest('.form-group').find('i.fa').remove();
            $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
        }
        else {
            $(this).closest('.form-group').removeClass('has-error has-feedback'); //.addClass('has-success has-feedback');
            $(this).closest('.form-group').find('i.fa').remove();
        }
    });



    //EDITA CADASTRO PRESO NA VIEW MOSTRARVISITANTES
    $('a[name=btnEditInterno]').click(function(){
        $("#myModalEditInterno").modal({backdrop: "static"});
    });

    //INCLUI NOVA FOTO DE PRESO NA VIEW MOSTRARVISITANTES
    $('a[name=btnNovaFoto]').click(function(){
        $("#myModalNovaFoto").modal({backdrop: "static"});
    });


    $('a[name=btnNovaAutorizacao]').click(function(){
        //$('#myModal').modal('show')
        $("#myModalNovo").modal({backdrop: "static"});
    });

    $('a[name=btnTipo]').click(function(){
        //$('#myModal').modal('show')
        $("#myModalTipo").modal({backdrop: "static"});
    });

    $('a[name=btnParentesco]').click(function(){
        $("#myModalParentesco").modal({backdrop: "static"});
    });

    $('a[name=btnNomeCPF]').click(function(){
        $("#myModalNomeCPF").modal({backdrop: "static"});
    });


    $('a[name=btnEditarAutorizacao]').click(function(){
        $('#autorizacao_id').val($(this).closest('tr').find('td[data-autorizacao_id]').data('autorizacao_id'));
        $('#nomevisita1').val($(this).closest('tr').find('td[data-nomevisita1]').data('nomevisita1'));
        $('#datacancelamento1').val($(this).closest('tr').find('td[data-datacancelamento1]').data('datacancelamento1'));
        $('#observacao1').val($(this).closest('tr').find('td[data-observacao1]').data('observacao1'));
        $("#myModalEditarAutorizacao").modal({backdrop: "static"});
    });



    $('a[name=btnMudarParentesco]').click(function(){

        $('#visitaapenadoid').val($(this).closest('tr').find('td[data-visitaapenadoid]').data('visitaapenadoid'));
         $('#apenado_id').val($(this).closest('tr').find('td[data-apenado_id]').data('apenado_id'));
        $('#parentesco').val($(this).closest('tr').find('td[data-parentesco]').data('parentesco'));
        $('#nomeapenado').val($(this).closest('tr').find('td[data-nomeapenado]').data('nomeapenado'));

        // $('#myModalParentesco').modal('hidden')
        $("#myModalMudarParentesco").modal({backdrop: "static"});
    });


    $('a[name=btnMudarNomeCPF]').click(function(){

        $('#visitaapenadoid').val($(this).closest('tr').find('td[data-visitaapenadoid]').data('visitaapenadoid'));
         $('#apenado_id').val($(this).closest('tr').find('td[data-apenado_id]').data('apenado_id'));
        $('#parentesco').val($(this).closest('tr').find('td[data-parentesco]').data('parentesco'));
        $('#nomeapenado').val($(this).closest('tr').find('td[data-nomeapenado]').data('nomeapenado'));
        $('#cpfapenado').val($(this).closest('tr').find('td[data-cpfpenado]').data('cpfapenado'));

        // $('#myModalParentesco').modal('hidden')
        $("#myModalMudarNomeCPF").modal({backdrop: "static"});
    });



    $('a[name=btnTipoVisita]').click(function(){

        $("#myModalTipoVisita").modal({backdrop: "static"});

    });


    $('a[name=btnMudarTipoVisita]').click(function(){
        $('#visitaapenadoid1').val($(this).closest('tr').find('td[data-visitaapenadoid1]').data('visitaapenadoid1'));
        $('#apenado_id1').val($(this).closest('tr').find('td[data-apenado_id1]').data('apenado_id1'));
        $('#parentesco1').val($(this).closest('tr').find('td[data-parentesco1]').data('parentesco1'));
        $('#nomeapenado1').val($(this).closest('tr').find('td[data-nomeapenado1]').data('nomeapenado1'));
        $('#tipo1').val($(this).closest('tr').find('td[data-tipo1]').data('tipo1'));

        $("#myModalMudarTipoVisita").modal({backdrop: "static"});

    });



    $('a[name=btnEditar]').click(function(){

         $('#id').val($(this).closest('tr').find('td[data-id]').data('id'));
         $('#nomevisita').val($(this).closest('tr').find('td[data-nomevisita]').data('nomevisita'));
         $('#cpfvisita').val($(this).closest('tr').find('td[data-cpfvisita]').data('cpfvisita'));
         $('#tipodocumento').val($(this).closest('tr').find('td[data-tipodocumento]').data('tipodocumento'));
         $('#numerodocumento').val($(this).closest('tr').find('td[data-numerodocumento]').data('numerodocumento'));
         $('#datanascimentovisita').val($(this).closest('tr').find('td[data-datanascimentovisita]').data('datanascimentovisita'));
         $('#rua').val($(this).closest('tr').find('td[data-rua]').data('rua'));
         $('#numero').val($(this).closest('tr').find('td[data-numero]').data('numero'));
         $('#bairro').val($(this).closest('tr').find('td[data-bairro]').data('bairro'));
        $('#telefonecontato').val($(this).closest('tr').find('td[data-telefonecontato]').data('telefonecontato'));

         $('#naturalidadevisita').val($(this).closest('tr').find('td[data-naturalidadevisita]').data('naturalidadevisita'));
         $('#sexovisitante').val($(this).closest('tr').find('td[data-sexovisitante]').data('sexovisitante'));
         $('#maevisita').val($(this).closest('tr').find('td[data-maevisita]').data('maevisita'));
         $('#paivisita').val($(this).closest('tr').find('td[data-paivisita]').data('paivisita'));
         $('#paivisita').val($(this).closest('tr').find('td[data-paivisita]').data('paivisita'));

         $('#datacadastrocarteirinha').val($(this).closest('tr').find('td[data-datacadastrocarteirinha]').data('datacadastrocarteirinha'));

            var fotovisita = $(this).closest('tr').find('td[data-fotovisita]').data('fotovisita');
           // alert(fotovisita);
            $('#fotovisita').attr('src', fotovisita );

        $("#myModalEditar").modal({backdrop: "static"});

    });

    $('a[name=btnCancelar]').click(function(){

        $('#idvisitacan').val($(this).closest('tr').find('td[data-idvisitacan]').data('idvisitacan'));
        $('#nomevisita').val($(this).closest('tr').find('td[data-nomevisita]').data('nomevisita'));
        $('#parentescovisita').val($(this).closest('tr').find('td[data-parentescovisita]').data('parentescovisita'));

        $('#visitaapen').val($(this).closest('tr').find('td[data-visitaapen]').data('visitaapen'));
        $('#dataemicaocarteirinha').val($(this).closest('tr').find('td[data-dataemicaocarteirinha]').data('dataemicaocarteirinha'));
        $('#apenado_id').val($(this).closest('tr').find('td[data-apenado_id]').data('apenado_id'));
        $('#cpfvisita').val($(this).closest('tr').find('td[data-cpfvisita]').data('cpfvisita'));

        // var fotovisita = $(this).closest('tr').find('td[data-fotovisita]').data('fotovisita');
        // $('#fotovisita').attr('src', fotovisita );

        $("#myModalCancelar").modal({backdrop: "static"});

    });







    $('a[name=btnRegistrar]').click(function(){

        $('#id').val($(this).closest('tr').find('td[data-id]').data('id'));
        $('#nomeapenado').val($(this).closest('tr').find('td[data-nomeapenado]').data('nomeapenado'));
        $('#parentescovisita').val($(this).closest('tr').find('td[data-parentescovisita]').data('parentescovisita'));

        $('#visita_id').val($(this).closest('tr').find('td[data-visita_id]').data('visita_id'));
        $('#visita_apenado_id').val($(this).closest('tr').find('td[data-visita_apenado_id]').data('visita_apenado_id'));
        $('#apenado_id').val($(this).closest('tr').find('td[data-apenado_id]').data('apenado_id'));
        $('#movimentacao_id').val($(this).closest('tr').find('td[data-movimentacao_id]').data('movimentacao_id'));
        $('#unidade_id').val($(this).closest('tr').find('td[data-unidade_id]').data('unidade_id'));

        var foto = $(this).closest('tr').find('td[data-foto]').data('foto');
        // alert(fotovisita);
        $('#foto').attr('src', foto );

        $("#myModalRegistrar").modal({backdrop: "static"});

    });



    //CANCELAR REGISTRO DE ENTRADA
    $('a[name=btnCancelarEntrada]').click(function(){

        $('#id').val($(this).closest('tr').find('td[data-id]').data('id'));
        $('#nomeapenado').val($(this).closest('tr').find('td[data-nomeapenado]').data('nomeapenado'));
        $('#nomevisita').val($(this).closest('tr').find('td[data-nomevisita]').data('nomevisita'));

        $("#myModalCancelarEntrada").modal({backdrop: "static"});

    });



    $('a[name=btnRegistrarMaterial]').click(function(){

        $('#id1').val($(this).closest('tr').find('td[data-id]').data('id'));
        $('#nomeapenado1').val($(this).closest('tr').find('td[data-nomeapenado]').data('nomeapenado'));
        $('#parentescovisita1').val($(this).closest('tr').find('td[data-parentescovisita]').data('parentescovisita'));

        $('#visita_id1').val($(this).closest('tr').find('td[data-visita_id]').data('visita_id'));
        $('#visita_apenado_id1').val($(this).closest('tr').find('td[data-visita_apenado_id]').data('visita_apenado_id'));
        $('#apenado_id1').val($(this).closest('tr').find('td[data-apenado_id]').data('apenado_id'));
        $('#movimentacao_id1').val($(this).closest('tr').find('td[data-movimentacao_id]').data('movimentacao_id'));
        $('#unidade_id1').val($(this).closest('tr').find('td[data-unidade_id]').data('unidade_id'));
       // $('#tipo').val($(this).closest('tr').find('td[data-tipo]').data('tipo'));

       // $('#tipo').val($(this).closest('tr').find('td[data-tipo]').data('tipo'));

        // $var = $(this).closest('tr').find('td[data-tipo]').data('tipo');
        // if($var == 'M'){
        //     $("#message").show();
        // }else{
        //     $("#message").hide();
        // }

        var foto = $(this).closest('tr').find('td[data-foto]').data('foto');
        // alert(fotovisita);
        $('#foto1').attr('src', foto );

        $("#myModalRegistrarMaterial").modal({backdrop: "static"});

    });

    $('a[name=btnRegistrarOnline]').click(function(){

        $('#id2').val($(this).closest('tr').find('td[data-id]').data('id'));
        $('#nomeapenado2').val($(this).closest('tr').find('td[data-nomeapenado]').data('nomeapenado'));
        $('#parentescovisita2').val($(this).closest('tr').find('td[data-parentescovisita]').data('parentescovisita'));

        $('#visita_id2').val($(this).closest('tr').find('td[data-visita_id]').data('visita_id'));
        $('#visita_apenado_id2').val($(this).closest('tr').find('td[data-visita_apenado_id]').data('visita_apenado_id'));
        $('#apenado_id2').val($(this).closest('tr').find('td[data-apenado_id]').data('apenado_id'));
        $('#movimentacao_id2').val($(this).closest('tr').find('td[data-movimentacao_id]').data('movimentacao_id'));
        $('#unidade_id2').val($(this).closest('tr').find('td[data-unidade_id]').data('unidade_id'));

        var foto = $(this).closest('tr').find('td[data-foto]').data('foto');
        // alert(fotovisita);
        $('#foto2').attr('src', foto );

        $("#myModalRegistrarOnline").modal({backdrop: "static"});

    });





    $('#datanascimento').change(function () {

        var nasc = $('#datanascimento').val();

        $('#idade').val();

    });




    $("input[type=text]").each(function () {
        if ($(this).hasClass('date') == true)
        {
            $(this).datepicker({
                format: "dd/mm/yyyy",
                language: "pt-BR",
                startDate: "01/01/1930",
                endDate: "31/12/2100",
                forceParse: "__-__-____",
                //startDate: '-20d',
                clearBtn: true,
                todayHighlight: true

            }).mask("99/99/9999");
    }

    if($(this).hasClass('mascaraDate') == true)
    {
        $(this).mask("99/99/9999");
    }

    });



    $("#btnSalvar").click(function () {
        var cont = 0;

        $('#formSalvar input').each(function (i) {
            var verificar = $(this).prop('disabled');

                    if ($(this).val() == "") {
                        cont++;
                        $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
                        $(this).closest('.form-group').find('i.fa').remove();
                        $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
                    }

        });


        if (cont == 0) {
            $("#formSalvar").submit();
        }
        else {
            return false;

        }
    });


    $("#btnModalsalvar").click(function () {
        var cont = 0;

        $('#formModalSalvar .form-control').each(function (i) {
            var verificar = $(this).prop('disabled');

            if($(this).hasClass('naoValidar') == true)
            {
                //não valida o input
            }

            else if($(this).is(":hidden"))
            {
                //se estiver invisivel nao valida o input.
            }

            else
            {
                if ($(this).val() == "") {
                    cont++;
                    $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
                    $(this).closest('.form-group').find('i.fa').remove();
                    $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
                }
            }

        });


        if (cont == 0) {
            $("#formModalSalvar").submit();
        }
        else {
            return false;

        }
    });


    $("#btnModalAtualizar").click(function () {
        var cont = 0;

        $('#formModalAtualizar .form-control').each(function (i) {
            var verificar = $(this).prop('disabled');


            if($(this).hasClass('naoValidar') == true)
            {
                //não valida o input
            }

            else if($(this).is(":hidden"))
            {
                //se estiver invisivel nao valida o input.
            }

            else
            {
                if ($(this).val() == "") {
                    cont++;
                    $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
                    $(this).closest('.form-group').find('i.fa').remove();
                    $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
                }
            }

        });


        if (cont == 0) {
            $("#formModalAtualizar").submit();
        }
        else {
            return false;

        }
    });




    $("#btnSalvarDados").click(function () {
        var cont = 0;

        $('#formModalDados .form-control').each(function (i) {
            var verificar = $(this).prop('disabled');

            //console.log($(this).attr('class'));
            //alert('else');
            if ($(this).val() == "") {
                cont++;
                $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
                $(this).closest('.form-group').find('i.fa').remove();
                $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
            }

        });


        if (cont == 0) {
            $("#formModalDados").submit();
        }
        else {
            return false;

        }
    });




    $("#btnModalCancelar").click(function () {
        var cont = 0;

        $('#formModalCancelar .form-control').each(function (i) {
            var verificar = $(this).prop('disabled');


            if($(this).hasClass('naoValidar') == true)
            {
                //não valida o input
            }

            else if($(this).is(":hidden"))
            {
                //se estiver invisivel nao valida o input.
            }

            else
            {
                if ($(this).val() == "") {
                    cont++;
                    $(this).closest('.form-group').removeClass('has-success has-feedback').addClass('has-error has-feedback');
                    $(this).closest('.form-group').find('i.fa').remove();
                    $(this).closest('.form-group').append('<i class="fa fa-times form-control-feedback"></i>');
                }
            }

        });


        if (cont == 0) {
            $("#formModalCancelar").submit();
        }
        else {
            return false;

        }
    });

    //idade


    $('#datanascimento').change(function () {

        var start= moment($("#datanascimento").val(), 'DD/MM/YYYY');
        var end = moment();
        var idade = end.diff(start, "years", false);
        $("#idade").val(idade);

        if(idade < 18){
            $("#menoridade").show();
        }else{
            $("#menoridade").hide();
        }


    });

});